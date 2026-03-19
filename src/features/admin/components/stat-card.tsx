import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";
import React from "react";

interface Props {
  title: string;
  description: string;
  icon: LucideIcon;
  isLoading: boolean;
  value: React.ReactNode;
  iconClassName?: React.ComponentProps<LucideIcon>["className"];
  iconContainerClassName?: React.ComponentProps<React.ElementType<HTMLDivElement>>["className"];
}

function AdminStatCard({title, value, isLoading, ...props}: Props) {
    const Icon = props.icon;
  return (
    <Card className="@container/card soft-shadow border-none space-y-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription className="-mt-1.5">
          {props.description}
        </CardDescription>
        <CardAction className={cn("border rounded-md p-2 -mt-1.5", props.iconContainerClassName)}>
          <Icon className={props.iconClassName} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {isLoading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            value
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default AdminStatCard;
