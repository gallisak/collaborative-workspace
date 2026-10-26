import { generateSharedDocumentMetadata, SharedDocumentPage } from '@/pages/shared-document';

export const generateMetadata = (props: PageProps<'/s/[token]'>) =>
  generateSharedDocumentMetadata(props);

export default function Page({ params }: PageProps<'/s/[token]'>) {
  return <SharedDocumentPage params={params} />;
}
