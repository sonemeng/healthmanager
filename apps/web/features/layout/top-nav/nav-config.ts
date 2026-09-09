import {
  LayoutDashboard,
  Clock,
  TestTubes,
  Pill,
  Upload,
  Share2,
  MessageSquare,
  Settings,
  ListChecks,
  Cable,
  Microscope,
  FileText,
  GitCompareArrows,
  HeartPulse,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  badge?: boolean;
}

// Primary navigation — main dashboard sections
export const navigation: NavItem[] = [
  { name: "首页", href: "/home", icon: LayoutDashboard },
  { name: "时间线", href: "/timeline", icon: Clock },
  { name: "检验指标", href: "/labs", icon: TestTubes },
  { name: "用药记录", href: "/medications", icon: Pill },
  { name: "病史", href: "/conditions", icon: HeartPulse },
  { name: "报告上传", href: "/uploads", icon: Upload },
];

// Secondary nav — less frequently used
export const secondaryNav: NavItem[] = [
  { name: "生物标志物", href: "/biomarkers", icon: ListChecks },
  { name: "检查套餐", href: "/testing", icon: Microscope },
  { name: "健康报告", href: "/reports", icon: FileText },
  { name: "就诊记录", href: "/encounters", icon: Stethoscope },
  { name: "关联分析", href: "/correlations", icon: GitCompareArrows },
  // { name: 'Sharing', href: '/sharing', icon: Share2 },
  { name: "AI 问答", href: "/ai", icon: MessageSquare },
];

// All mobile nav items
export const allMobileNav: NavItem[] = [
  ...navigation,
  ...secondaryNav,
  { name: "数据集成", href: "/integrations", icon: Cable },
  { name: "设置", href: "/settings", icon: Settings },
];
