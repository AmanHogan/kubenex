/**
 * Decorative radial glow pinned to the top-right corner.
 * Same spotlight-behind-content effect as c4-diagram / tweakcn.
 */
export function PageGlow(): React.JSX.Element {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed -top-32 right-[-10%] -z-10 h-[480px] w-[480px] rounded-full bg-primary/[0.08] blur-[120px]"
    />
  );
}
