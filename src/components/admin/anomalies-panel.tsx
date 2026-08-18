import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateShort } from '@/lib/format';
import type { Anomaly, AnomalySeverity } from '@/lib/mep';

const SEVERITY_LABEL: Record<AnomalySeverity, string> = {
  critique: 'Critique',
  attention: 'À vérifier',
  info: 'Réglage',
};

const SEVERITY_VARIANT: Record<AnomalySeverity, 'destructive' | 'default' | 'secondary'> = {
  critique: 'destructive',
  attention: 'default',
  info: 'secondary',
};

export function AnomaliesPanel({ anomalies }: { anomalies: Anomaly[] }) {
  if (anomalies.length === 0) {
    return (
      <Card className="p-8 text-center text-sm">
        Rien à signaler sur cette période : comptages complets, aucune variation suspecte.
      </Card>
    );
  }

  return (
    <ul className="divide-y overflow-hidden rounded-lg border">
      {anomalies.map((anomaly, index) => (
        <li key={`${anomaly.kind}-${anomaly.date}-${index}`} className="flex items-start gap-3 p-4">
          <Badge variant={SEVERITY_VARIANT[anomaly.severity]} className="shrink-0">
            {SEVERITY_LABEL[anomaly.severity]}
          </Badge>

          <div className="min-w-0 flex-1">
            <p className="text-sm">{anomaly.message}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">{formatDateShort(anomaly.date)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
