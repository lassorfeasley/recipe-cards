import CardReview from "@/components/CardReview";

export default async function CardsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CardReview batchId={id} />;
}
