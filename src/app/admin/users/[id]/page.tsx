import { UserDetailClient } from "./user-detail-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminUserDetailPage({ params }: Props) {
  const { id } = await params;
  return <UserDetailClient userId={id} />;
}
