"use client"

import * as React from "react"
import {
  CaptionLabel as DayPickerCaptionLabel,
  DayPicker,
  getDefaultClassNames,
  MonthGrid as DayPickerMonthGrid,
  Nav as DayPickerNav,
  useDayPicker,
  type DayButton,
  type Locale,
} from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon } from "lucide-react"

const YEAR_PAGE_SIZE = 12
const YEAR_GRID_COLS = 4
const YEAR_GRID_FADE_MS = 120

const calLabels = {
  selectYear: (year: number) => `Выберите год ${year}`,
  yearNav: "Навигация по годам",
  prevYears: "Предыдущие годы",
  nextYears: "Следующие годы",
  yearPicker: "Выбор года",
}

type CalendarPickerContextValue = {
  enableYearPicker: boolean
  minYear: number
  maxYear: number
  locale?: Partial<Locale>
  yearPickerOpen: boolean
  setYearPickerOpen: (open: boolean) => void
  yearPageStart: number
  setYearPageStart: React.Dispatch<React.SetStateAction<number>>
  focusedYearIndex: number
  setFocusedYearIndex: React.Dispatch<React.SetStateAction<number>>
  yearGridFadedIn: boolean
}

const CalendarPickerContext =
  React.createContext<CalendarPickerContextValue | null>(null)

function useCalendarPicker() {
  return React.useContext(CalendarPickerContext)
}

function getYearPageStart(
  year: number,
  minYear: number,
  maxYear: number,
): number {
  let start = minYear + Math.floor((year - minYear) / YEAR_PAGE_SIZE) * YEAR_PAGE_SIZE
  if (start + YEAR_PAGE_SIZE - 1 > maxYear) {
    start = Math.max(minYear, maxYear - YEAR_PAGE_SIZE + 1)
  }
  return start
}

function clampYearIndex(index: number, pageStart: number, minYear: number, maxYear: number) {
  for (let i = index; i >= 0; i--) {
    const y = pageStart + i
    if (y >= minYear && y <= maxYear) return i
  }
  for (let i = index; i < YEAR_PAGE_SIZE; i++) {
    const y = pageStart + i
    if (y >= minYear && y <= maxYear) return i
  }
  return 0
}

function CalendarCaptionLabel(
  props: React.ComponentProps<typeof DayPickerCaptionLabel>,
) {
  const picker = useCalendarPicker()
  const { months } = useDayPicker()
  const { className, children: _children, ...rest } = props
  const displayDate = months[0]?.date ?? new Date()

  if (!picker?.enableYearPicker) {
    return (
      <DayPickerCaptionLabel className={className} {...rest}>
        {_children}
      </DayPickerCaptionLabel>
    )
  }

  if (picker.yearPickerOpen) {
    const rangeEnd = picker.yearPageStart + YEAR_PAGE_SIZE - 1
    return (
      <span
        className={cn(className, "font-medium select-none")}
        role="status"
        aria-live="polite"
        {...rest}
      >
        {picker.yearPageStart}–{rangeEnd}
      </span>
    )
  }

  const monthName = displayDate.toLocaleString(picker.locale?.code ?? "en", {
    month: "long",
  })
  const year = displayDate.getFullYear()

  const openYearPicker = () => {
    const pageStart = getYearPageStart(year, picker.minYear, picker.maxYear)
    picker.setYearPageStart(pageStart)
    picker.setFocusedYearIndex(
      clampYearIndex(year - pageStart, pageStart, picker.minYear, picker.maxYear),
    )
    picker.setYearPickerOpen(true)
  }

  return (
    <span
      className={cn(className, "inline-flex items-center gap-1 font-medium select-none")}
      role="status"
      aria-live="polite"
      {...rest}
    >
      <span>{monthName}</span>
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-0.5 rounded-sm underline decoration-muted-foreground/60 underline-offset-2 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={calLabels.selectYear(year)}
        aria-expanded={picker.yearPickerOpen}
        onClick={openYearPicker}
      >
        {year}
        <ChevronDownIcon className="size-3.5 text-muted-foreground" aria-hidden />
      </button>
    </span>
  )
}

function CalendarNav(props: React.ComponentProps<typeof DayPickerNav>) {
  const picker = useCalendarPicker()
  const { classNames, components } = useDayPicker()

  if (!picker?.enableYearPicker || !picker.yearPickerOpen) {
    return <DayPickerNav {...props} />
  }

  const canPrev = picker.yearPageStart > picker.minYear
  const canNext = picker.yearPageStart + YEAR_PAGE_SIZE <= picker.maxYear

  const goPrevPage = () => {
    if (!canPrev) return
    const nextStart = Math.max(
      picker.minYear,
      picker.yearPageStart - YEAR_PAGE_SIZE,
    )
    picker.setYearPageStart(nextStart)
    picker.setFocusedYearIndex(
      clampYearIndex(
        picker.focusedYearIndex,
        nextStart,
        picker.minYear,
        picker.maxYear,
      ),
    )
  }

  const goNextPage = () => {
    if (!canNext) return
    const nextStart = picker.yearPageStart + YEAR_PAGE_SIZE
    picker.setYearPageStart(nextStart)
    picker.setFocusedYearIndex(
      clampYearIndex(
        picker.focusedYearIndex,
        nextStart,
        picker.minYear,
        picker.maxYear,
      ),
    )
  }

  return (
    <nav
      className={classNames.nav}
      aria-label={calLabels.yearNav}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault()
          goPrevPage()
        }
        if (e.key === "ArrowRight") {
          e.preventDefault()
          goNextPage()
        }
      }}
    >
      <components.PreviousMonthButton
        type="button"
        className={classNames.button_previous}
        tabIndex={canPrev ? undefined : -1}
        aria-disabled={canPrev ? undefined : true}
        aria-label={calLabels.prevYears}
        onClick={goPrevPage}
      >
        <components.Chevron
          disabled={canPrev ? undefined : true}
          className={classNames.chevron}
          orientation="left"
        />
      </components.PreviousMonthButton>
      <components.NextMonthButton
        type="button"
        className={classNames.button_next}
        tabIndex={canNext ? undefined : -1}
        aria-disabled={canNext ? undefined : true}
        aria-label={calLabels.nextYears}
        onClick={goNextPage}
      >
        <components.Chevron
          disabled={canNext ? undefined : true}
          className={classNames.chevron}
          orientation="right"
        />
      </components.NextMonthButton>
    </nav>
  )
}

function CalendarYearGrid() {
  const picker = useCalendarPicker()
  const { months, goToMonth, selected } = useDayPicker()
  const displayDate = months[0]?.date ?? new Date()
  const selectedDate = selected as Date | undefined
  const selectedYear = selectedDate?.getFullYear() ?? displayDate.getFullYear()
  const gridRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!picker?.yearPickerOpen) return
    const btn = gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-year-index="${picker.focusedYearIndex}"]`,
    )
    btn?.focus()
  }, [picker?.yearPickerOpen, picker?.focusedYearIndex, picker?.yearPageStart])

  if (!picker) return null

  const years = Array.from(
    { length: YEAR_PAGE_SIZE },
    (_, i) => picker.yearPageStart + i,
  )

  const selectYear = (year: number) => {
    if (year < picker.minYear || year > picker.maxYear) return
    const next = new Date(displayDate)
    next.setFullYear(year)
    next.setDate(1)
    goToMonth(next)
    picker.setYearPickerOpen(false)
  }

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label={calLabels.yearPicker}
      className={cn(
        "grid w-full grid-cols-4 gap-2 py-1 transition-opacity duration-120",
        picker.yearGridFadedIn ? "opacity-100" : "opacity-0",
      )}
      onKeyDown={(e) => {
        let next = picker.focusedYearIndex
        if (e.key === "ArrowRight") {
          e.preventDefault()
          next = Math.min(YEAR_PAGE_SIZE - 1, next + 1)
        } else if (e.key === "ArrowLeft") {
          e.preventDefault()
          next = Math.max(0, next - 1)
        } else if (e.key === "ArrowDown") {
          e.preventDefault()
          next = Math.min(YEAR_PAGE_SIZE - 1, next + YEAR_GRID_COLS)
        } else if (e.key === "ArrowUp") {
          e.preventDefault()
          next = Math.max(0, next - YEAR_GRID_COLS)
        } else if (e.key === "Enter") {
          e.preventDefault()
          const year = picker.yearPageStart + picker.focusedYearIndex
          selectYear(year)
          return
        } else if (e.key === "Escape") {
          e.preventDefault()
          picker.setYearPickerOpen(false)
          return
        } else {
          return
        }
        picker.setFocusedYearIndex(
          clampYearIndex(next, picker.yearPageStart, picker.minYear, picker.maxYear),
        )
      }}
    >
      {years.map((year, index) => {
        const inRange = year >= picker.minYear && year <= picker.maxYear
        const isSelected = year === selectedYear
        const isFocused = index === picker.focusedYearIndex
        return (
          <button
            key={year}
            type="button"
            role="gridcell"
            data-year-index={index}
            tabIndex={isFocused ? 0 : -1}
            disabled={!inRange}
            aria-selected={isSelected}
            className={cn(
              "flex h-(--cell-size) cursor-pointer items-center justify-center rounded-(--cell-radius) text-sm select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isSelected && "font-bold text-primary",
              !inRange && "cursor-default text-muted-foreground opacity-50",
              inRange && !isSelected && "hover:bg-muted",
            )}
            onClick={() => selectYear(year)}
            onFocus={() => picker.setFocusedYearIndex(index)}
          >
            {year}
          </button>
        )
      })}
    </div>
  )
}

function CalendarMonthGrid(
  props: React.ComponentProps<typeof DayPickerMonthGrid>,
) {
  const picker = useCalendarPicker()
  if (picker?.enableYearPicker && picker.yearPickerOpen) {
    return (
      <div className={cn(props.className)}>
        <CalendarYearGrid />
      </div>
    )
  }
  return <DayPickerMonthGrid {...props} />
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  locale,
  formatters,
  components,
  enableYearPicker = false,
  fromYear,
  toYear,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
  enableYearPicker?: boolean
  fromYear?: number
  toYear?: number
}) {
  const defaultClassNames = getDefaultClassNames()
  const currentYear = new Date().getFullYear()
  const minYear = fromYear ?? currentYear - 100
  const maxYear = toYear ?? currentYear

  const [yearPickerOpen, setYearPickerOpen] = React.useState(false)
  const [yearPageStart, setYearPageStart] = React.useState(() =>
    getYearPageStart(currentYear, minYear, maxYear),
  )
  const [focusedYearIndex, setFocusedYearIndex] = React.useState(0)
  const [yearGridFadedIn, setYearGridFadedIn] = React.useState(false)

  const closeYearPicker = React.useCallback(() => {
    setYearGridFadedIn(false)
    window.setTimeout(() => setYearPickerOpen(false), YEAR_GRID_FADE_MS)
  }, [])

  const openYearPicker = React.useCallback(() => {
    setYearPickerOpen(true)
    requestAnimationFrame(() => setYearGridFadedIn(true))
  }, [])

  const setYearPickerOpenWrapped = React.useCallback(
    (open: boolean) => {
      if (open) {
        openYearPicker()
      } else {
        closeYearPicker()
      }
    },
    [closeYearPicker, openYearPicker],
  )

  const pickerContext = React.useMemo<CalendarPickerContextValue>(
    () => ({
      enableYearPicker,
      minYear,
      maxYear,
      locale,
      yearPickerOpen,
      setYearPickerOpen: setYearPickerOpenWrapped,
      yearPageStart,
      setYearPageStart,
      focusedYearIndex,
      setFocusedYearIndex,
      yearGridFadedIn,
    }),
    [
      enableYearPicker,
      minYear,
      maxYear,
      locale,
      yearPickerOpen,
      setYearPickerOpenWrapped,
      yearPageStart,
      focusedYearIndex,
      yearGridFadedIn,
    ],
  )

  const handleRootKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (enableYearPicker && yearPickerOpen && e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        closeYearPicker()
      }
    },
    [enableYearPicker, yearPickerOpen, closeYearPicker],
  )

  return (
    <CalendarPickerContext.Provider value={pickerContext}>
      <DayPicker
        showOutsideDays={showOutsideDays}
        className={cn(
          "group/calendar bg-background p-2 [--cell-radius:var(--radius-md)] [--cell-size:--spacing(7)] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent",
          String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
          String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
          className,
        )}
        captionLayout={captionLayout}
        locale={locale}
        formatters={{
          formatMonthDropdown: (date) =>
            date.toLocaleString(locale?.code, { month: "short" }),
          ...formatters,
        }}
        classNames={{
          root: cn("w-fit", defaultClassNames.root),
          months: cn(
            "relative flex flex-col gap-4 md:flex-row",
            defaultClassNames.months,
          ),
          month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
          nav: cn(
            "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
            defaultClassNames.nav,
          ),
          button_previous: cn(
            buttonVariants({ variant: buttonVariant }),
            "size-(--cell-size) p-0 select-none aria-disabled:opacity-50",
            defaultClassNames.button_previous,
          ),
          button_next: cn(
            buttonVariants({ variant: buttonVariant }),
            "size-(--cell-size) p-0 select-none aria-disabled:opacity-50",
            defaultClassNames.button_next,
          ),
          month_caption: cn(
            "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
            defaultClassNames.month_caption,
          ),
          dropdowns: cn(
            "flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium",
            defaultClassNames.dropdowns,
          ),
          dropdown_root: cn(
            "relative rounded-(--cell-radius)",
            defaultClassNames.dropdown_root,
          ),
          dropdown: cn(
            "absolute inset-0 bg-popover opacity-0",
            defaultClassNames.dropdown,
          ),
          caption_label: cn(
            "font-medium select-none",
            captionLayout === "label"
              ? "text-sm"
              : "flex items-center gap-1 rounded-(--cell-radius) text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground",
            defaultClassNames.caption_label,
          ),
          month_grid: "w-full border-collapse",
          weekdays: cn("flex", defaultClassNames.weekdays),
          weekday: cn(
            "flex-1 rounded-(--cell-radius) text-[0.8rem] font-normal text-muted-foreground select-none",
            defaultClassNames.weekday,
          ),
          week: cn("mt-2 flex w-full", defaultClassNames.week),
          week_number_header: cn(
            "w-(--cell-size) select-none",
            defaultClassNames.week_number_header,
          ),
          week_number: cn(
            "text-[0.8rem] text-muted-foreground select-none",
            defaultClassNames.week_number,
          ),
          day: cn(
            "group/day relative aspect-square h-full w-full rounded-(--cell-radius) p-0 text-center select-none [&:last-child[data-selected=true]_button]:rounded-r-(--cell-radius)",
            props.showWeekNumber
              ? "[&:nth-child(2)[data-selected=true]_button]:rounded-l-(--cell-radius)"
              : "[&:first-child[data-selected=true]_button]:rounded-l-(--cell-radius)",
            defaultClassNames.day,
          ),
          range_start: cn(
            "relative isolate z-0 rounded-l-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:right-0 after:w-4 after:bg-muted",
            defaultClassNames.range_start,
          ),
          range_middle: cn("rounded-none", defaultClassNames.range_middle),
          range_end: cn(
            "relative isolate z-0 rounded-r-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:left-0 after:w-4 after:bg-muted",
            defaultClassNames.range_end,
          ),
          today: cn(
            "rounded-(--cell-radius) bg-muted text-foreground data-[selected=true]:rounded-none",
            defaultClassNames.today,
          ),
          outside: cn(
            "text-muted-foreground aria-selected:text-muted-foreground",
            defaultClassNames.outside,
          ),
          disabled: cn(
            "text-muted-foreground opacity-50",
            defaultClassNames.disabled,
          ),
          hidden: cn("invisible", defaultClassNames.hidden),
          ...classNames,
        }}
        components={{
          Root: ({ className, rootRef, ...rootProps }) => {
            return (
              <div
                data-slot="calendar"
                ref={rootRef}
                className={cn(className)}
                onKeyDown={handleRootKeyDown}
                {...rootProps}
              />
            )
          },
          Chevron: ({ className, orientation, ...chevronProps }) => {
            if (orientation === "left") {
              return (
                <ChevronLeftIcon
                  className={cn("size-4", className)}
                  {...chevronProps}
                />
              )
            }

            if (orientation === "right") {
              return (
                <ChevronRightIcon
                  className={cn("size-4", className)}
                  {...chevronProps}
                />
              )
            }

            return (
              <ChevronDownIcon
                className={cn("size-4", className)}
                {...chevronProps}
              />
            )
          },
          CaptionLabel: CalendarCaptionLabel,
          Nav: CalendarNav,
          MonthGrid: CalendarMonthGrid,
          DayButton: ({ ...dayProps }) => (
            <CalendarDayButton locale={locale} {...dayProps} />
          ),
          WeekNumber: ({ children, ...weekProps }) => {
            return (
              <td {...weekProps}>
                <div className="flex size-(--cell-size) items-center justify-center text-center">
                  {children}
                </div>
              </td>
            )
          },
          ...components,
        }}
        {...props}
      />
    </CalendarPickerContext.Provider>
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  locale,
  ...props
}: React.ComponentProps<typeof DayButton> & { locale?: Partial<Locale> }) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString(locale?.code)}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "relative isolate z-10 flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 border-0 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-ring/50 data-[range-end=true]:rounded-(--cell-radius) data-[range-end=true]:rounded-r-(--cell-radius) data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-muted data-[range-middle=true]:text-foreground data-[range-start=true]:rounded-(--cell-radius) data-[range-start=true]:rounded-l-(--cell-radius) data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground dark:hover:text-foreground [&>span]:text-xs [&>span]:opacity-70",
        defaultClassNames.day,
        className,
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
