import { pixelPath, type Bitmap } from '../../lib/pixels';

interface PixelIconProps {
  bitmap: Bitmap;
  /** Screen pixels per bitmap pixel. */
  scale?: number;
  /** Names the icon for screen readers; without one it's decorative. */
  label?: string;
}

/** A 1-bit icon in the current text colour, so it follows the theme. */
export function PixelIcon({ bitmap, scale = 2, label }: PixelIconProps) {
  const width = Math.max(...bitmap.map((row) => row.length));
  const height = bitmap.length;

  return (
    <svg
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={pixelPath(bitmap)} fill="currentColor" />
    </svg>
  );
}
