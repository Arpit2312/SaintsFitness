"use client";

import { Button } from "@/components/ui/button";
import { Printer, Share2 } from "lucide-react";

export function ReceiptActions({
  studentMobile,
  shareMessage,
}: {
  studentMobile: string;
  shareMessage: string;
}) {
  function handlePrint() {
    window.print();
  }

  function handleShare() {
    const url = `https://wa.me/91${studentMobile}?text=${encodeURIComponent(shareMessage)}`;
    window.open(url, "_blank");
  }

  return (
    <div className="flex justify-center gap-3 print:hidden">
      <Button variant="outline" onClick={handlePrint}>
        <Printer size={16} className="mr-2" />
        Print / Download PDF
      </Button>
      <Button variant="outline" onClick={handleShare}>
        <Share2 size={16} className="mr-2" />
        Share via WhatsApp
      </Button>
    </div>
  );
}
