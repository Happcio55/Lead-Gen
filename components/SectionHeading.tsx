type Props = {
  kicker?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
};

export default function SectionHeading({ kicker, title, description, className = "" }: Props) {
  return (
    <div className={`max-w-2xl ${className}`}>
      {kicker && <p className="text-sm font-semibold text-amber">{kicker}</p>}
      <h2 className="mt-3 font-display text-4xl font-bold leading-[1.02] tracking-tight sm:text-[56px]">{title}</h2>
      {description && <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">{description}</p>}
    </div>
  );
}
