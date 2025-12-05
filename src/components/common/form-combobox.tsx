"use client";

import { useState } from "react";
import { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormMessage } from "../ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";

export default function FormCombobox<T extends FieldValues>({
  form,
  name,
  label,
  selectItem,
  placeholder = "Search...",
  emptyText = "No results found.",
}: {
  form: UseFormReturn<T>;
  name: Path<T>;
  label: string;
  selectItem: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormLabel>{label}</FormLabel>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className={cn(
                  "w-full justify-between font-normal",
                  !field.value && "text-muted-foreground",
                  form.formState.errors[name]?.message && "border-red-500"
                )}
              >
                {field.value
                  ? selectItem.find((item) => item.value === field.value)?.label || field.value
                  : `Select ${label}`}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder={placeholder} />
                <CommandList>
                  <CommandEmpty>{emptyText}</CommandEmpty>
                  <CommandGroup>
                    {selectItem.map((item) => (
                      <CommandItem
                        key={item.value}
                        value={item.label}
                        disabled={item.disabled}
                        onSelect={() => {
                          field.onChange(item.value);
                          setOpen(false);
                        }}
                        className="capitalize"
                      >
                        <Check
                          className={cn("mr-2 h-4 w-4", field.value === item.value ? "opacity-100" : "opacity-0")}
                        />
                        {item.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}
