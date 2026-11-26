//! The threaded build's proving pool: rayon's global pool, each thread a Web
//! Worker running this module on the same shared memory.
//!
//! The workers start first and wait in `run_thread`: building the pool blocks
//! until every thread runs, and a worker can't start while the one that
//! created it is blocked.

use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Mutex, OnceLock};

use rayon::ThreadBuilder;
use wasm_bindgen::prelude::*;

struct Thread(ThreadBuilder);
// SAFETY: rayon's own default spawn moves each ThreadBuilder to its thread.
unsafe impl Send for Thread {}

type Threads = (Mutex<Sender<Thread>>, Mutex<Receiver<Thread>>);

fn threads() -> &'static Threads {
    static THREADS: OnceLock<Threads> = OnceLock::new();
    THREADS.get_or_init(|| {
        let (to, from) = channel();
        (Mutex::new(to), Mutex::new(from))
    })
}

/// Waits for `start_threads` to hand this worker a thread, then runs it; never returns.
#[wasm_bindgen]
pub fn run_thread() {
    let Thread(thread) = threads().1.lock().unwrap().recv().unwrap();
    thread.run();
}

/// Builds the pool on `count` workers already waiting in `run_thread`.
#[wasm_bindgen]
pub fn start_threads(count: usize) -> Result<(), JsError> {
    rayon::ThreadPoolBuilder::new()
        .num_threads(count)
        .spawn_handler(|thread| {
            threads()
                .0
                .lock()
                .unwrap()
                .send(Thread(thread))
                .map_err(|_| std::io::Error::other("the pool workers are gone"))
        })
        .build_global()
        .map_err(|e| JsError::new(&e.to_string()))
}
