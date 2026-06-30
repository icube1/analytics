import { NextResponse } from "next/server";
import {
  deleteStatementFile,
  loadStatementsFromDisk,
  saveStatementFile,
} from "@/lib/statements-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = loadStatementsFromDisk();
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось прочитать выписки";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const savedFiles: string[] = [];

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const files = form
        .getAll("file")
        .filter((entry): entry is File => entry instanceof File);

      if (files.length === 0) {
        return NextResponse.json({ error: "Файлы не переданы" }, { status: 400 });
      }

      for (const file of files) {
        const text = await file.text();
        savedFiles.push(saveStatementFile(file.name, text));
      }
    } else {
      const body = (await request.json()) as {
        files?: { name: string; content: string }[];
      };

      if (!body.files?.length) {
        return NextResponse.json({ error: "Файлы не переданы" }, { status: 400 });
      }

      for (const file of body.files) {
        savedFiles.push(saveStatementFile(file.name, file.content));
      }
    }

    const data = loadStatementsFromDisk();
    return NextResponse.json({ ...data, savedFiles });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось сохранить выписки";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const file = new URL(request.url).searchParams.get("file");
    if (!file) {
      return NextResponse.json({ error: "Не указан файл" }, { status: 400 });
    }

    deleteStatementFile(file);
    const data = loadStatementsFromDisk();
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось удалить файл";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
