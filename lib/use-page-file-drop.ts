"use client";

import { useEffect, useRef, useState } from "react";
import { matchDroppedFiles } from "@/lib/match-dropped-files";

interface UsePageFileDropOptions {
  enabled?: boolean;
  accept: string[];
  multiple?: boolean;
  onDrop: (files: File[]) => void | Promise<void>;
  onReject?: (reason: string) => void;
}

function isFileDrag(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).some(
    (type) =>
      type === "Files" ||
      type === "application/x-moz-file" ||
      type.toLowerCase() === "files",
  );
}

export function usePageFileDrop({
  enabled = true,
  accept,
  multiple = false,
  onDrop,
  onReject,
}: UsePageFileDropOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const depthRef = useRef(0);
  const onDropRef = useRef(onDrop);
  const onRejectRef = useRef(onReject);
  const acceptRef = useRef(accept);
  const multipleRef = useRef(multiple);
  const acceptKey = accept.join(",");

  useEffect(() => {
    onDropRef.current = onDrop;
  }, [onDrop]);

  useEffect(() => {
    onRejectRef.current = onReject;
  }, [onReject]);

  useEffect(() => {
    acceptRef.current = accept;
  }, [acceptKey, accept]);

  useEffect(() => {
    multipleRef.current = multiple;
  }, [multiple]);

  useEffect(() => {
    if (!enabled) {
      depthRef.current = 0;
      setIsDragging(false);
      return;
    }

    const onDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      depthRef.current += 1;
      if (depthRef.current === 1) {
        setIsDragging(true);
      }
    };

    const onDragLeave = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      depthRef.current -= 1;
      if (depthRef.current <= 0) {
        depthRef.current = 0;
        setIsDragging(false);
      }
    };

    const onDragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    };

    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      depthRef.current = 0;
      setIsDragging(false);

      const rawFiles = event.dataTransfer?.files;
      if (!rawFiles?.length) return;

      const matched = matchDroppedFiles(rawFiles, acceptRef.current);
      if (matched.length === 0) {
        onRejectRef.current?.(
          `Подходят только файлы: ${acceptRef.current.join(", ")}`,
        );
        return;
      }

      const payload = multipleRef.current ? matched : [matched[0]];
      void Promise.resolve(onDropRef.current(payload)).catch((error) => {
        console.error("File drop handler failed:", error);
      });
    };

    const capture = { capture: true };

    document.addEventListener("dragenter", onDragEnter, capture);
    document.addEventListener("dragleave", onDragLeave, capture);
    document.addEventListener("dragover", onDragOver, capture);
    document.addEventListener("drop", onDrop, capture);

    return () => {
      document.removeEventListener("dragenter", onDragEnter, capture);
      document.removeEventListener("dragleave", onDragLeave, capture);
      document.removeEventListener("dragover", onDragOver, capture);
      document.removeEventListener("drop", onDrop, capture);
    };
  }, [enabled, acceptKey, multiple]);

  return { isDragging };
}
