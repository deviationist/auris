"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";
import { WHISPER_LANGUAGES } from "@/lib/whisper-languages";

/** Full combobox with button trigger — used in settings dialogs */
export function LanguageCombobox({
  value,
  onValueChange,
  includeAuto = true,
}: {
  value: string;
  onValueChange: (code: string) => void;
  includeAuto?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const languages = includeAuto ? WHISPER_LANGUAGES : WHISPER_LANGUAGES.filter((l) => l.code !== "auto");
  const selectedName = WHISPER_LANGUAGES.find((l) => l.code === value)?.name || value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="flex-1 justify-between"
        >
          {selectedName}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search language..." />
          <CommandList>
            <CommandEmpty>No language found.</CommandEmpty>
            {languages.map((lang) => (
              <CommandItem
                key={lang.code}
                value={lang.name}
                className="rounded-none"
                onSelect={() => {
                  onValueChange(lang.code);
                  setOpen(false);
                }}
              >
                <Check
                  className={`mr-2 h-4 w-4 ${value === lang.code ? "opacity-100" : "opacity-0"}`}
                />
                {lang.name}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Inline searchable language list — used inside dropdown menus and popovers */
export function LanguageSearchList({
  onSelect,
}: {
  onSelect: (code: string) => void;
}) {
  return (
    <Command>
      <CommandInput placeholder="Search language..." />
      <CommandList className="max-h-[200px]">
        <CommandEmpty>No language found.</CommandEmpty>
        {WHISPER_LANGUAGES.filter((l) => l.code !== "auto").map((lang) => (
          <CommandItem
            key={lang.code}
            value={lang.name}
            className="rounded-none"
            onSelect={() => onSelect(lang.code)}
          >
            {lang.name}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

/** Resolve a language code to its display name */
export function languageName(code: string): string {
  return WHISPER_LANGUAGES.find((l) => l.code === code)?.name || code;
}
