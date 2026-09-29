export function focusPathIds(nodes: Array<{ id: string; parent: string | null }>, focusId: string): Set<string> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const focused = new Set<string>();
  let current = byId.get(focusId);
  while (current) {
    focused.add(current.id);
    current = current.parent ? byId.get(current.parent) : undefined;
  }
  const stack = [focusId];
  while (stack.length) {
    const parent = stack.pop()!;
    for (const node of nodes) {
      if (node.parent !== parent || focused.has(node.id)) continue;
      focused.add(node.id);
      stack.push(node.id);
    }
  }
  return focused;
}
