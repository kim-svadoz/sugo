/** Shared loading and empty states. Existing Console rendering is preserved during normalization. */
export function LoadingSpinner() {
  return <div className="flex items-center justify-center py-8"><div className="h-6 w-6 animate-spin rounded-full border-b-2 border-[var(--color-primary)]" /></div>;
}
export function EmptyState({ message }: { message: string }) {
  return <div className="py-8 text-center text-[12.5px] text-[var(--color-text-dim)]">{message}</div>;
}
