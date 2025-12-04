import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title?: string;
  value?: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
}

export default function StatsCard({ title, value, change, changeType, icon: Icon }: StatsCardProps) {
  const getChangeColor = () => {
    switch (changeType) {
      case "positive":
        return "text-green-600";
      case "negative":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  const getChangeSymbol = () => {
    if (changeType === "positive") return "↗";
    if (changeType === "negative") return "↘";
    return "";
  };

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Icon className="w-5 h-5 text-blue-600" />
          </div>
        </div>
        <div className={`text-sm font-medium ${getChangeColor()}`}>
          {getChangeSymbol()} {change}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-sm text-gray-600">{title}</div>
      </div>
    </div>
  );
}
