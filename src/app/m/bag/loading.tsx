import { ListSkeleton } from "@/features/mobile/components/skeletons";

export default function Loading() {
  return <ListSkeleton rows={3} title={80} />;
}
