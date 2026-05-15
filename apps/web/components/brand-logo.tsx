import Image from "next/image";

// Override per environment via NEXT_PUBLIC_LOGO_DEV_TOKEN.
const FALLBACK_TOKEN = "pk_P-Mb-aJ7Q5mMSfDyjok-xg";

export function BrandLogo({
  name,
  size = 26,
  alt,
}: {
  name: string;
  size?: number;
  alt?: string;
}) {
  const token = process.env["NEXT_PUBLIC_LOGO_DEV_TOKEN"] || FALLBACK_TOKEN;
  const src = `https://img.logo.dev/${name}?token=${token}`;
  return (
    <Image
      src={src}
      width={size}
      height={size}
      alt={alt ?? name}
      style={{ display: "block" }}
      unoptimized
    />
  );
}
