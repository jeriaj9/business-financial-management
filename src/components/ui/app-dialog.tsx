import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

export interface AppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClass?: string;
  className?: string;
  headerClassName?: string;
}

export function AppDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  maxWidthClass = "sm:max-w-md",
  className,
  headerClassName,
}: AppDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("w-[95vw] max-h-[90vh] overflow-y-auto flex flex-col", maxWidthClass, className)}>
        {(title || description) && (
          <DialogHeader className={cn("shrink-0", headerClassName)}>
            {title && <DialogTitle>{title}</DialogTitle>}
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}

        {children && (
          <div className="flex-1 min-h-0 py-2">
            {children}
          </div>
        )}

        {footer && (
          <DialogFooter className="shrink-0 pt-2">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

export interface ConfirmDialogProps extends Omit<AppDialogProps, "footer" | "children"> {
  onConfirm: () => void;
  isConfirming?: boolean;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  isConfirming = false,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "destructive",
  children,
  ...props
}: ConfirmDialogProps) {
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isConfirming}>
            {cancelText}
          </Button>
          <Button variant={variant} onClick={onConfirm} disabled={isConfirming}>
            {confirmText}
          </Button>
        </>
      }
      {...props}
    >
      {children}
    </AppDialog>
  )
}
