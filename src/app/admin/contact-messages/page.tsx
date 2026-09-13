import { ContactQueue } from "@/features/contact/components/contact-queue";

export default function AdminContactMessagesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-stone-800">Contact messages</h1>
        <p className="mt-0.5 text-sm text-stone-500">
          Everything sent through /contact. Oldest first — each sender was told they would hear back
          within a few hours.
        </p>
      </div>
      <ContactQueue />
    </div>
  );
}
