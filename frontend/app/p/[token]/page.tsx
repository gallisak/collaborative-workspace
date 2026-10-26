import { generatePublicDocumentMetadata, PublicDocumentPage } from '@/pages/public-document';

export const generateStaticParams = () => [{ token: 'not-found' }];

export const generateMetadata = (props: PageProps<'/p/[token]'>) =>
  generatePublicDocumentMetadata(props);

export default function Page({ params }: PageProps<'/p/[token]'>) {
  return <PublicDocumentPage params={params} />;
}
