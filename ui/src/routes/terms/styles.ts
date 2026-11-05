import { tv } from '@heroui/styles';

export const termsStyles = tv({
  slots: {
    page: 'mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-8',
    title: 'text-2xl font-semibold text-foreground',
    heading: 'text-xl font-semibold',
    text: 'text-base leading-relaxed text-foreground',
    muted: 'text-sm text-muted',
    actions: 'flex flex-wrap items-center gap-3',
    form: 'flex flex-col gap-4',
    html: 'text-base leading-relaxed text-foreground break-words [&_h2]:my-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-3 [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:text-accent [&_a]:underline [&_li]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4',
    source: 'min-h-80 w-full font-mono text-sm',
    copy: 'min-h-64 w-full text-base',
    row: 'flex flex-wrap items-center justify-between gap-3 border-b border-border py-3',
  },
});
