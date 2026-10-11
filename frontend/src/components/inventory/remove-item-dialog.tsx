"use client";

import { useState } from "react";
import type { InventoryItem } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Confirmation for removing an item from the shelf, with an optional note for the history log. */
export function RemoveItemDialog({ item, onClose, onConfirm }: { item: InventoryItem | null; onClose: () => void; onConfirm: (note?: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <Dialog
      open={Boolean(item)}
      onOpenChange={(o) => {
        if (!o) {
          setNote("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove this item?</DialogTitle>
          <DialogDescription>
            {item ? `${item.quantity} ${item.unit} of ${item.name} will be marked as removed and logged in history. This cannot be undone.` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="remove-note">Note <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Textarea id="remove-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Past best-by date, disposed" rows={2} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              onConfirm(note.trim() || undefined);
              setNote("");
            }}
          >
            Remove item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
