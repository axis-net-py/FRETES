import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
export function apiError(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
    return NextResponse.json(
      { error: "Este registro já existe." },
      { status: 409 },
    );
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  )
    return NextResponse.json(
      { error: "Cadastro relacionado não encontrado." },
      { status: 400 },
    );
  console.error(
    "Operation failed",
    error instanceof Error ? error.name : "unknown",
  );
  return NextResponse.json(
    { error: "Não foi possível salvar. Tente novamente." },
    { status: 500 },
  );
}
