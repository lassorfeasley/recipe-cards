import AlignWorkbench from "@/components/AlignWorkbench";

export default async function AlignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AlignWorkbench batchId={id} />;
}
