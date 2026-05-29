import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ResumenCardProps {
  title: string;
  value: string | number;
  description: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onClick?: () => void;
  className?: string;
}

export function ResumenCard({ title, value, description, icon, actionLabel, onClick, className }: ResumenCardProps) {
  const isInteractive = Boolean(onClick);

  return (
    <Card
      aria-label={isInteractive ? `${title}. ${actionLabel ?? description}` : undefined}
      className={cn(
        isInteractive &&
          "cursor-pointer transition hover:-translate-y-0.5 hover:ring-primary/30 focus-visible:ring-2 focus-visible:ring-ring/50",
        className
      )}
      onClick={onClick}
      onKeyDown={
        isInteractive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardDescription>{title}</CardDescription>
          <CardTitle className="mt-2 text-3xl font-semibold">{value}</CardTitle>
        </div>
        <div className="rounded-xl bg-muted p-2 text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
        {actionLabel && <p className="mt-2 text-xs font-medium text-primary">{actionLabel}</p>}
      </CardContent>
    </Card>
  );
}