// TODO review comment
// create a queue that accepts items in any index, but process them in order
export function serialQueue<T>() {
  const items = new Map<number, T>();
  let currentIndex = 0;

  // TODO review comment
  // add the the new item on its index position
  function add(index: number, item: T) {
    items.set(index, item);
  }

  // TODO review comment
  // move forward until has not more gaps
  function consumeNextItems() {
    const nextItems: T[] = [];
    while (items.has(currentIndex)) {
      const item = items.get(currentIndex)!;
      items.delete(currentIndex);
      currentIndex += 1;
      nextItems.push(item);
    }
    return nextItems;
  }

  return {
    add,
    consumeNextItems,
  };
}
