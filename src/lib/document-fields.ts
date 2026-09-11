import { z } from "zod";
export const fieldLabels = {
  clientName: "Cliente / destinatário",
  code: "Número do container",
  crt: "Número do CRT",
  micDta: "Número do MIC/DTA",
  driverName: "Motorista",
  truckPlate: "Placa do cavalo",
  trailerPlate: "Placa da carreta",
  freightValue: "Valor do frete",
  freightCurrency: "Moeda (USD, PYG, BRL…)",
  origin: "Origem do frete",
  destination: "Destino do frete",
  seal: "Lacre",
};
export type DocumentFields = Record<keyof typeof fieldLabels, string>;
export const emptyFields = Object.fromEntries(
  Object.keys(fieldLabels).map((k) => [k, ""]),
) as DocumentFields;
export const documentFieldsSchema = z
  .object({
    clientName: z.string().trim().min(2).max(120),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{4}\d{7}$/, "Container: use 4 letras e 7 números."),
    crt: z.string().trim().max(80),
    micDta: z.string().trim().max(80),
    driverName: z.string().trim().min(2).max(120),
    truckPlate: z.string().trim().toUpperCase().min(3).max(15),
    trailerPlate: z.string().trim().toUpperCase().max(15),
    freightValue: z
      .string()
      .regex(
        /^(?:\d{1,12}(?:\.\d{1,2})?)?$/,
        "Use o valor com ponto decimal, por exemplo 2200.00.",
      ),
    freightCurrency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^(?:[A-Z]{3})?$/),
    origin: z.string().trim().max(160),
    destination: z.string().trim().max(160),
    seal: z.string().trim().max(80),
  })
  .refine(
    (d) => !d.freightValue || !!d.freightCurrency,
    "Informe a moeda do frete.",
  );
export function detectDocumentType(b: Uint8Array) {
  if (Buffer.from(b.subarray(0, 5)).toString() === "%PDF-")
    return "application/pdf";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (
    Buffer.from(b.subarray(0, 8)).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
  )
    return "image/png";
  return null;
}
