import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  formatVariableValueForPicker,
  isDateTimeVariableType,
  isDateVariableType,
  parseVariableValueFromPicker,
} from "@/lib/variables";
import type {
  QueryVariableDefinition,
  QueryVariableValue,
} from "@/types/query";
import { CalendarIcon } from "lucide-react";
import { useMemo, useState } from "react";

type VariableDatePickerProps = {
  className?: string;
  definition: Pick<
    QueryVariableDefinition,
    "key" | "label" | "type" | "multiple"
  >;
  disabled?: boolean;
  placeholder?: string;
  value: QueryVariableValue | undefined;
  onChange: (value: QueryVariableValue) => void;
};

const formatDatePart = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseLocalDate = (value: string) => {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );

  if (!match) {
    return undefined;
  }

  const [, year, month, day, hours = "0", minutes = "0", seconds = "0"] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds),
  );

  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const getDisplayLabel = (
  value: QueryVariableValue | undefined,
  definition: VariableDatePickerProps["definition"],
) => {
  if (Array.isArray(value) || value == null || value === "") {
    return "";
  }

  const parsed = parseLocalDate(String(value).replace("T", " "));
  if (!parsed) {
    return String(value);
  }

  if (isDateTimeVariableType(definition)) {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(parsed);
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
};

export function VariableDatePicker({
  className,
  definition,
  disabled = false,
  placeholder,
  value,
  onChange,
}: VariableDatePickerProps) {
  const [open, setOpen] = useState(false);
  const pickerValue = formatVariableValueForPicker(value, definition);

  const selectedDate = useMemo(
    () => parseLocalDate(pickerValue.replace("T", " ")),
    [pickerValue],
  );

  const timeValue = useMemo(() => {
    if (!isDateTimeVariableType(definition)) {
      return "";
    }

    const match = pickerValue.match(/T(\d{2}:\d{2})/);
    return match?.[1] ?? "00:00";
  }, [definition, pickerValue]);

  if (!isDateVariableType(definition) && !isDateTimeVariableType(definition)) {
    return null;
  }

  const commitValue = (nextDate: Date | undefined, nextTime = timeValue) => {
    if (!nextDate) {
      onChange(null);
      return;
    }

    const datePart = formatDatePart(nextDate);
    const rawValue = isDateTimeVariableType(definition)
      ? `${datePart}T${nextTime || "00:00"}`
      : datePart;

    onChange(parseVariableValueFromPicker(rawValue, definition));
  };

  return (
    <Popover open={disabled ? false : open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !pickerValue && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {pickerValue
            ? getDisplayLabel(value, definition)
            : (placeholder ??
              (isDateTimeVariableType(definition)
                ? "Pick a date and time"
                : "Pick a date"))}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(nextDate) => {
            commitValue(nextDate);
            if (nextDate && !isDateTimeVariableType(definition)) {
              setOpen(false);
            }
          }}
          initialFocus
        />
        {isDateTimeVariableType(definition) ? (
          <div className="border-t p-3">
            <label className="mb-2 block text-xs font-medium text-muted-foreground">
              Time
            </label>
            <input
              type="time"
              step={60}
              value={timeValue}
              disabled={disabled || !selectedDate}
              onChange={(event) =>
                commitValue(selectedDate, event.target.value || "00:00")
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none"
            />
          </div>
        ) : null}
        <div className="flex justify-end gap-2 border-t p-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            Clear
          </Button>
          {isDateTimeVariableType(definition) ? (
            <Button
              type="button"
              size="sm"
              disabled={disabled}
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
