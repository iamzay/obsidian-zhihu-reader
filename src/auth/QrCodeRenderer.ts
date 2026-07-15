import { toDataURL } from "qrcode";

export type QrCodeRenderer = (content: string) => Promise<string>;

export const renderQrCodeDataUrl: QrCodeRenderer = async (content) =>
  await toDataURL(content, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 280,
    color: { dark: "#000000", light: "#ffffff" },
  });
