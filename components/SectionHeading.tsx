type Props = {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  dark?: boolean;
  className?: string;
};

export default function SectionHeading({ eyebrow, title, description, dark = false, className = "" }: Props) {
  return (
    <div className={`max-w-2xl ${className}`}>
      <p className={`font-mono text-xs uppercase tracking-[0.14em] ${dark ? "text-lime" : "text-violet"}`}>{eyebrow}</p>
      <h2
        className={`mt-3 font-serif text-4xl leading-[1.05] tracking-tight sm:text-5xl ${dark ? "text-paper" : "text-ink"}`}
      >
        {title}
      </h2>
      {description && (
        <p className={`mt-4 text-lg leading-relaxed ${dark ? "text-muted-dark" : "text-muted"}`}>{description}</p>
      )}
    </div>
  );
}
