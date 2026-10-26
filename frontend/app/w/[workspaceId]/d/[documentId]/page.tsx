import { DocumentPage } from '@/pages/document';

export default function Page({ params }: PageProps<'/w/[workspaceId]/d/[documentId]'>) {
  return <DocumentPage params={params} />;
}
