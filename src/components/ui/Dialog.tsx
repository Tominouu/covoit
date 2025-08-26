import React from "react";

export const Dialog: React.FC<React.HTMLAttributes<HTMLDivElement> & { open?: boolean; onOpenChange?: (open: boolean) => void }> = ({ children }) => <div>{children}</div>;
export const DialogTrigger: React.FC<React.HTMLAttributes<HTMLDivElement> & { asChild?: boolean }> = ({ children }) => <>{children}</>;
export const DialogContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = (props) => <div {...props} />;
export const DialogHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = (props) => <div {...props} />;
export const DialogFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = (props) => <div {...props} />;
export const DialogTitle: React.FC<React.HTMLAttributes<HTMLDivElement>> = (props) => <div {...props} />;
export const DialogDescription: React.FC<React.HTMLAttributes<HTMLDivElement>> = (props) => <div {...props} />;
