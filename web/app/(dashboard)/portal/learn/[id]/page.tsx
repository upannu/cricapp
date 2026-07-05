import { ArticleReaderClient } from "@/components/ArticleReaderClient";

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ArticleReaderClient articleId={id} />;
}
