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

export function focusRootId(nodes: Array<{ id: string; parent: string | null }>, focusId: string): string | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let current = byId.get(focusId);
  if (!current) return null;
  while (current.parent && byId.has(current.parent)) current = byId.get(current.parent)!;
  return current.id;
}
