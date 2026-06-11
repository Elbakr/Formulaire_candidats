// Karim 2026-06-11 : rendu d'icone par nom (reutilise dans la nav + l'ecran HR
// hub). Memes noms que NavIconName (src/lib/navigation.ts).
import {
  LayoutDashboard, Users, KanbanSquare, Briefcase, Mail, FileBarChart,
  Calendar, FileText, MessageSquare, User, Building2, Sliders,
  CalendarDays, UserCheck, CalendarOff, Clock, Sparkles, AlertTriangle,
  Activity, ShoppingBag, ArrowRightLeft, AlertCircle, Megaphone,
  Star, RefreshCw, TrendingUp, LifeBuoy, Stethoscope, ShieldCheck,
  Upload, ClipboardEdit, FileSignature, Wallet, Receipt,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Users, KanbanSquare, Briefcase, Mail, FileBarChart,
  Calendar, FileText, MessageSquare, User, Building2, Sliders,
  CalendarDays, UserCheck, CalendarOff, Clock, Sparkles, AlertTriangle,
  Activity, ShoppingBag, ArrowRightLeft, AlertCircle, Megaphone,
  Star, RefreshCw, TrendingUp, LifeBuoy, Stethoscope, ShieldCheck,
  Upload, ClipboardEdit, FileSignature, Wallet, Receipt,
};

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? LayoutDashboard;
  return <Icon className={className} />;
}
