import { AssistedQueue } from "@/features/assisted/components/assisted-queue";

export default function AdminAssistedRequestsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-stone-800">Assisted requests</h1>
        <p className="mt-0.5 text-sm text-stone-500">
          Customers whose link we could not read, in their own words. Oldest first — each one has
          been told a person will get back to them.
        </p>
      </div>
      <AssistedQueue />
    </div>
  );
}
