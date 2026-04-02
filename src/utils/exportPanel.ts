import html2canvas from 'html2canvas';

export async function exportPanel(ref: React.RefObject<HTMLElement | null>, filename: string) {
  if (!ref.current) return;
  
  const canvas = await html2canvas(ref.current, {
    backgroundColor: null,
    scale: 2,
  });

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = '14px Inter, sans-serif';
    ctx.fillStyle = 'rgba(107, 114, 128, 0.5)'; // muted text
    ctx.textAlign = 'right';
    ctx.fillText('MM Sovereign Credit', canvas.width - 20, canvas.height - 20);
  }

  const link = document.createElement('a');
  link.download = `${filename}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
