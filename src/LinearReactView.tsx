import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BasesEntry, BasesPropertyId, DateValue, Value } from "obsidian";
import { useApp } from "./hooks";
import { resolveEntryImage } from "./utils/entry-images";
import { tryGetValue } from "./utils/bases";
import { LinearEntry } from "./linear-view";

interface LinearReactViewProps {
  entries: LinearEntry[];
  properties: BasesPropertyId[];
  imageProperty?: BasesPropertyId | null;
  propertyOverlayOpacity: number;
  alignPropertiesBottom: boolean;
  dayCellHeight: number;
  alignWeekdays: boolean;
  propertyChipScale: number;
  highlightWeekends: boolean;
  onEntryClick: (entry: BasesEntry, isModEvent: boolean) => void;
  onEntryContextMenu: (evt: React.MouseEvent, entry: BasesEntry) => void;
}

const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const daysInMonth = (year: number, month: number): number =>
  new Date(year, month + 1, 0).getDate();

const dateKey = (year: number, month: number, day: number): string =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export const LinearReactView: React.FC<LinearReactViewProps> = ({
  entries,
  properties,
  imageProperty,
  propertyOverlayOpacity,
  alignPropertiesBottom,
  dayCellHeight,
  alignWeekdays,
  propertyChipScale,
  highlightWeekends,
  onEntryClick,
  onEntryContextMenu,
}) => {
  const app = useApp();
  const containerRef = useRef<HTMLDivElement>(null);

  const { entriesByDate, years } = useMemo(() => {
    const map = new Map<string, LinearEntry[]>();
    let minYear: number | null = null;
    let maxYear: number | null = null;

    for (const entry of entries) {
      const start = new Date(
        entry.startDate.getFullYear(),
        entry.startDate.getMonth(),
        entry.startDate.getDate(),
      );
      const end = entry.endDate
        ? new Date(
            entry.endDate.getFullYear(),
            entry.endDate.getMonth(),
            entry.endDate.getDate(),
          )
        : new Date(start);

      if (end < start) continue;

      const iter = new Date(start);
      while (iter <= end) {
        const key = dateKey(
          iter.getFullYear(),
          iter.getMonth(),
          iter.getDate(),
        );
        if (!map.has(key)) map.set(key, []);
        map.get(key)?.push(entry);
        iter.setDate(iter.getDate() + 1);
      }

      minYear =
        minYear === null
          ? entry.startDate.getFullYear()
          : Math.min(minYear, entry.startDate.getFullYear());
      maxYear =
        maxYear === null
          ? entry.startDate.getFullYear()
          : Math.max(maxYear, entry.startDate.getFullYear());

      if (entry.endDate) {
        minYear = Math.min(minYear ?? entry.endDate.getFullYear(), entry.endDate.getFullYear());
        maxYear = Math.max(maxYear ?? entry.endDate.getFullYear(), entry.endDate.getFullYear());
      }
    }

    const resolvedMin = minYear ?? new Date().getFullYear();
    const resolvedMax = maxYear ?? resolvedMin;
    const yearList: number[] = [];
    for (let y = resolvedMin; y <= resolvedMax; y++) {
      yearList.push(y);
    }

    return { entriesByDate: map, years: yearList };
  }, [entries]);

  const [currentYear, setCurrentYear] = useState<number>(() => {
    const thisYear = new Date().getFullYear();
    if (years.includes(thisYear)) return thisYear;
    return years.length > 0 ? years[0] : thisYear;
  });

  const goPrevYear = useCallback(() => {
    const idx = years.indexOf(currentYear);
    if (idx > 0) setCurrentYear(years[idx - 1]);
  }, [currentYear, years]);

  const goNextYear = useCallback(() => {
    const idx = years.indexOf(currentYear);
    if (idx !== -1 && idx < years.length - 1) setCurrentYear(years[idx + 1]);
  }, [currentYear, years]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !alignWeekdays || !highlightWeekends) return;

    let frameId = 0;
    const updateVars = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const row = container.querySelector(
          ".linear-calendar-month-row",
        ) as HTMLElement | null;
        const dayCell = container.querySelector(
          ".linear-calendar-day:not(.is-out-of-month)",
        ) as HTMLElement | null;
        if (!row || !dayCell) return;
        const rect = dayCell.getBoundingClientRect();
        const containerStyles = getComputedStyle(container);
        const gapValue =
          containerStyles.getPropertyValue("--linear-month-gap") ||
          containerStyles.gap ||
          "0";
        const gap = Number.parseFloat(gapValue) || 0;
        container.style.setProperty("--linear-col-width", `${rect.width}px`);
        container.style.setProperty("--linear-col-gap", `${gap}px`);
      });
    };

    updateVars();
    const observer = new ResizeObserver(updateVars);
    observer.observe(container);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [alignWeekdays, highlightWeekends, currentYear, dayCellHeight]);

  const hasNonEmptyValue = useCallback((value: any): boolean => {
    if (!value || !value.isTruthy()) return false;
    const str = value.toString();
    return str && str.trim().length > 0;
  }, []);

  const PropertyValue: React.FC<{ value: Value }> = ({ value }) => {
    const elementRef = useCallback(
      (node: HTMLElement | null) => {
        const forceReadable = (element: HTMLElement) => {
          element.style.setProperty("color", "inherit", "important");
          element.style.setProperty("opacity", "1", "important");
          element.style.setProperty("filter", "none", "important");
          element
            .querySelectorAll<HTMLElement>("*")
            .forEach((child) => {
              child.style.setProperty("color", "inherit", "important");
              child.style.setProperty("opacity", "1", "important");
              child.style.setProperty("filter", "none", "important");
            });
        };

        if (node && app) {
          while (node.firstChild) {
            node.removeChild(node.firstChild);
          }

          if (!(value instanceof DateValue)) {
            value.renderTo(node, app.renderContext);
            forceReadable(node);
            return;
          }

          if ("date" in value && value.date && value.date instanceof Date) {
            if ("time" in value && value.time) {
              node.appendChild(
                document.createTextNode(
                  value.date.toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                ),
              );
            } else {
              node.appendChild(
                document.createTextNode(
                  value.date.toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  }),
                ),
              );
            }

            forceReadable(node);
            return;
          }
        }
      },
      [value],
    );

    return <span ref={elementRef} />;
  };

  const renderCell = (
    year: number,
    month: number,
    day: number,
    valid: boolean,
    extraClass?: string,
  ) => {
    const key = dateKey(year, month, day);
    const dayEntries = valid ? entriesByDate.get(key) : undefined;
    const primary = dayEntries?.[0];
    const hasMultiple = (dayEntries?.length ?? 0) > 1;
    const isWeekend =
      highlightWeekends && !alignWeekdays && valid
        ? (() => {
            const d = new Date(year, month, day);
            const dow = d.getDay();
            return dow === 0 || dow === 6;
          })()
        : false;

    const handleClick = (evt: React.MouseEvent) => {
      if (!primary) return;
      const isMod = evt.ctrlKey || evt.metaKey;
      onEntryClick(primary.entry, isMod);
    };

    const handleContextMenu = (evt: React.MouseEvent) => {
      if (!primary) return;
      onEntryContextMenu(evt, primary.entry);
    };

    if (!valid) {
      return (
        <div
          key={key}
          className={[
            "linear-calendar-day",
            "is-out-of-month",
            extraClass,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="linear-calendar-day-inner" />
        </div>
      );
    }

    if (!primary) {
      return (
        <div key={key} className="linear-calendar-day">
          <div className="linear-calendar-day-inner">
            <div className="linear-calendar-day-number">{day}</div>
          </div>
        </div>
      );
    }

    const entry = primary.entry;
    const validProperties: { propertyId: BasesPropertyId; value: Value }[] =
      [];
    for (const prop of properties) {
      const value = tryGetValue(entry, prop);
      if (value && hasNonEmptyValue(value)) {
        validProperties.push({ propertyId: prop, value });
      }
    }

    const previewImage = resolveEntryImage(app, entry, imageProperty);
    const hasProperties = validProperties.length > 0;
    const overlayBackground =
      propertyOverlayOpacity > 0
        ? `rgba(0, 0, 0, ${propertyOverlayOpacity})`
        : undefined;
    const chipOverlayStyle =
      overlayBackground !== undefined
        ? {
            backgroundColor: overlayBackground,
            border: "none",
          }
        : {
            backgroundColor: "transparent",
            border: "none",
          };

    const renderChip = (
      content: React.ReactNode,
      key: string | number,
      extraClass?: string,
    ) => (
      <div
        key={key}
        className={["linear-calendar-chip", extraClass]
          .filter(Boolean)
          .join(" ")}
        style={chipOverlayStyle}
      >
        {content}
      </div>
    );

    const remainingProperties = validProperties.slice(1);
    const chipContainerClasses = ["linear-calendar-chips"];
    if (alignPropertiesBottom) {
      chipContainerClasses.push("linear-calendar-chips--bottom");
    }

    return (
      <div
        key={key}
        className={[
          "linear-calendar-day",
          isWeekend ? "is-weekend" : "",
          extraClass,
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <div
          className={[
            "linear-calendar-day-inner",
            previewImage ? "has-image" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {previewImage && (
            <div
              className="linear-calendar-day-image"
              style={{ backgroundImage: `url(${previewImage.url})` }}
            />
          )}
          {previewImage && <div className="linear-calendar-day-scrim" />}
          <div className="linear-calendar-day-number">{day}</div>
          {hasProperties ? (
            <div className={chipContainerClasses.join(" ")}>
              {renderChip(
                <div className="linear-calendar-chip-title">
                  <PropertyValue value={validProperties[0].value} />
                </div>,
                validProperties[0].propertyId,
                "linear-calendar-chip--title",
              )}
              {remainingProperties.length > 0 && (
                <div className="linear-calendar-chip-stack">
                  {remainingProperties.map(({ propertyId: prop, value }) =>
                    renderChip(
                      <span className="linear-calendar-chip-value">
                        <PropertyValue value={value} />
                      </span>,
                      prop,
                    ),
                  )}
                </div>
              )}
              {hasMultiple &&
                renderChip(
                  <span className="linear-calendar-chip-value">
                    +{(dayEntries?.length ?? 1) - 1} more
                  </span>,
                  "more",
                  "linear-calendar-chip--meta",
                )}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const renderStandardYear = () => (
    <div className="linear-calendar-grid">
      <div className="linear-calendar-corner" />
      {Array.from({ length: 31 }, (_, i) => (
        <div key={`head-${i}`} className="linear-calendar-day-header">
          {i + 1}
        </div>
      ))}

      {monthNames.map((monthName, monthIndex) => {
        const days = daysInMonth(currentYear, monthIndex);
        return (
          <React.Fragment key={`${currentYear}-${monthName}`}>
            <div className="linear-calendar-month-label">{monthName}</div>
            {Array.from({ length: 31 }, (_, dayIndex) =>
              renderCell(
                currentYear,
                monthIndex,
                dayIndex + 1,
                dayIndex + 1 <= days,
              ),
            )}
          </React.Fragment>
        );
      })}
    </div>
  );

  const renderAlignedYear = () => {
    const monthSlots = monthNames.map((_, monthIndex) => {
      const days = daysInMonth(currentYear, monthIndex);
      const firstWeekday = new Date(currentYear, monthIndex, 1).getDay();
      const totalSlots = Math.ceil((firstWeekday + days) / 7) * 7;
      return { days, firstWeekday, totalSlots };
    });

    const maxSlots = monthSlots.reduce(
      (max, m) => Math.max(max, m.totalSlots),
      0,
    );

    return (
      <div
        className={[
          "linear-calendar-grid",
          "aligned",
          highlightWeekends ? "has-weekend-highlight" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div
          className="linear-calendar-weekdays"
          style={{
            gridTemplateColumns: `var(--linear-month-label-width) repeat(${maxSlots}, minmax(48px, 1fr))`,
          }}
        >
          <div className="linear-calendar-corner" />
          {Array.from({ length: maxSlots }, (_, i) => (
            <div key={`weekday-${i}`} className="linear-calendar-day-header">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][i % 7]}
            </div>
          ))}
        </div>

        {monthNames.map((monthName, monthIndex) => {
          const meta = monthSlots[monthIndex];
          const slots = Array.from({ length: maxSlots }, (_, idx) => {
            if (idx >= meta.totalSlots) {
              return (
                <div
                  key={`${monthIndex}-pad-${idx}`}
                  className="linear-calendar-day is-out-of-month"
                >
                  <div className="linear-calendar-day-inner" />
                </div>
              );
            }
            const dayNum = idx - meta.firstWeekday + 1;
            const valid = dayNum >= 1 && dayNum <= meta.days;
            return renderCell(currentYear, monthIndex, dayNum, valid);
          });

          return (
            <div
              className="linear-calendar-month-row"
              key={`${currentYear}-${monthName}`}
              style={
                {
                  gridTemplateColumns: `var(--linear-month-label-width) repeat(${maxSlots}, minmax(48px, 1fr))`,
                  "--linear-month-columns": maxSlots,
                } as React.CSSProperties
              }
            >
              <div className="linear-calendar-month-label">{monthName}</div>
              {slots}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="linear-calendar"
      style={
        {
          "--linear-day-cell-height": `${dayCellHeight}px`,
          "--bases-chip-scale": `${propertyChipScale}`,
        } as React.CSSProperties
      }
    >
      <div className="linear-calendar-toolbar">
        <button
          className="linear-calendar-nav"
          type="button"
          onClick={goPrevYear}
          disabled={years.indexOf(currentYear) <= 0}
        >
          ←
        </button>
        <div className="linear-calendar-year-header">{currentYear}</div>
        <button
          className="linear-calendar-nav"
          type="button"
          onClick={goNextYear}
          disabled={
            years.indexOf(currentYear) === -1 ||
            years.indexOf(currentYear) === years.length - 1
          }
        >
          →
        </button>
      </div>

      <div className="linear-calendar-year">
        {alignWeekdays ? renderAlignedYear() : renderStandardYear()}
      </div>
    </div>
  );
};
