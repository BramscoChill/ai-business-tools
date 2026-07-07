import { DemoTile, type Demo } from "@/components/DemoTile";

const demos: Demo[] = [
  {
    slug: "invoice-extractor",
    icon: "📄",
    title: "Invoice/Receipt Extractor",
    description:
      "Upload PDF invoices or receipts and get structured data back — vendor, date, line items, totals — editable and exportable to CSV.",
    live: true,
  },
  {
    slug: "inbox-triage",
    icon: "📬",
    title: "Support Inbox Triage",
    description:
      "Paste a batch of support emails and get each one categorized, urgency-scored, and answered with a suggested reply draft.",
    live: true,
  },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-10">
      <section className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">AI Business Tools</h1>
        <p className="mx-auto mt-3 max-w-xl text-black/60 dark:text-white/60">
          Two focused demos of AI eliminating manual back-office work. Pick an
          application to try it — no sign-up, sample data included.
        </p>
      </section>
      <section className="grid gap-6 sm:grid-cols-2">
        {demos.map((demo) => (
          <DemoTile key={demo.slug} demo={demo} />
        ))}
      </section>
    </div>
  );
}
