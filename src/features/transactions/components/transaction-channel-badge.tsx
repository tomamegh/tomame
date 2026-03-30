import { Badge } from "@/components/ui/badge";
import {
  CreditCardIcon,
  SmartphoneIcon,
  BuildingIcon,
  HelpCircleIcon,
} from "lucide-react";

const CHANNEL_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; className: string }
> = {
  card: {
    label: "Card",
    icon: CreditCardIcon,
    className: "bg-blue-50 text-blue-700 border-blue-100",
  },
  mobile_money: {
    label: "Mobile Money",
    icon: SmartphoneIcon,
    className: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
  bank: {
    label: "Bank",
    icon: BuildingIcon,
    className: "bg-violet-50 text-violet-700 border-violet-100",
  },
  bank_transfer: {
    label: "Bank Transfer",
    icon: BuildingIcon,
    className: "bg-violet-50 text-violet-700 border-violet-100",
  },
};

function TransactionChannelBadge({ channel }: { channel: string | null }) {
  const cfg = channel
    ? (CHANNEL_CONFIG[channel] ?? {
        label: channel,
        icon: HelpCircleIcon,
        className: "bg-stone-50 text-stone-600 border-stone-200",
      })
    : null;

  if (!cfg) return <Badge className="text-stone-400">—</Badge>;

  const Icon = cfg.icon;
  return (
    <Badge
      className={`inline-flex items-center gap-1.5 text-sm font-medium py-2 rounded-full border ${cfg.className}`}
    >
      <Icon className="size-3.5" />
      {cfg.label}
    </Badge>
  );
}

export default TransactionChannelBadge;
