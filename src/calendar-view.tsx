import {
  BasesEntry,
  BasesPropertyId,
  BasesView,
  DateValue,
  Menu,
  parsePropertyId,
  QueryController,
  ViewOption,
} from "obsidian";
import { StrictMode } from "react";
import { createRoot, Root } from "react-dom/client";
import { CalendarReactView } from "./CalendarReactView";
import { AppContext } from "./context";

export const CalendarViewType = "calendar";

interface CalendarEntry {
  entry: BasesEntry;
  startDate: Date;
  endDate?: Date;
}

export class CalendarView extends BasesView {
  type = CalendarViewType;
  scrollEl: HTMLElement;
  containerEl: HTMLElement;
  root: Root | null = null;

  // Internal rendering data
  private entries: CalendarEntry[] = [];
  private startDateProp: BasesPropertyId | null = null;
  private endDateProp: BasesPropertyId | null = null;
  private imageProp: BasesPropertyId | null = null;
  private propertyOverlayOpacity: number = 0;
  private dayNumberSize: number = 18;
  private alignPropertiesBottom: boolean = false;
  private dayCellHeight: number = 120;
  private weekStartDay: number = 1;

  constructor(controller: QueryController, scrollEl: HTMLElement) {
    super(controller);
    this.scrollEl = scrollEl;
    this.containerEl = scrollEl.createDiv({
      cls: "bases-calendar-container is-loading",
      attr: { tabIndex: 0 },
    });
  }

  onload(): void {
    // React components will handle their own lifecycle
  }

  onunload() {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
    this.entries = [];
  }

  onResize(): void {
    // TODO: Find a better way to handle resizing
    this.updateCalendar();
  }

  public focus(): void {
    this.containerEl.focus({ preventScroll: true });
  }

  public onDataUpdated(): void {
    this.containerEl.removeClass("is-loading");
    this.loadConfig();
    this.updateCalendar();
  }

  private loadConfig(): void {
    this.startDateProp = this.config.getAsPropertyId("startDate");
    this.endDateProp = this.config.getAsPropertyId("endDate");
    this.imageProp = this.config.getAsPropertyId("imageProperty");
    this.propertyOverlayOpacity = this.getOverlayOpacity();
    this.dayNumberSize = this.getDayNumberSize();
    this.alignPropertiesBottom = this.getBooleanConfig(
      "alignPropertiesBottom",
    );
    this.dayCellHeight = this.getDayCellHeight();
    this.applyDayNumberStyles();
    const weekStartDayValue = this.config.get("weekStartDay") as string;

    const dayNameToNumber: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    this.weekStartDay = weekStartDayValue
      ? (dayNameToNumber[weekStartDayValue] ?? 1)
      : 1; // Default to Monday
  }

  private updateCalendar(): void {
    if (!this.data || !this.startDateProp) {
      this.root?.unmount();
      this.root = null;
      this.containerEl.empty();
      this.containerEl.createDiv("bases-calendar-empty").textContent =
        "Configure a start date property to display entries";
      return;
    }

    this.entries = [];
    for (const entry of this.data.data) {
      const startDate = this.extractDate(entry, this.startDateProp);
      if (startDate) {
        const endDate = this.endDateProp
          ? (this.extractDate(entry, this.endDateProp) ?? undefined)
          : undefined;
        this.entries.push({
          entry,
          startDate,
          endDate,
        });
      }
    }

    this.renderReactCalendar();
  }

  private renderReactCalendar(): void {
    if (!this.root) {
      this.root = createRoot(this.containerEl);
    }

    this.root.render(
      <StrictMode>
        <AppContext.Provider value={this.app}>
          <CalendarReactView
            entries={this.entries}
            weekStartDay={this.weekStartDay}
            properties={this.config.getOrder() || []}
            imageProperty={this.imageProp}
            propertyOverlayOpacity={this.propertyOverlayOpacity}
            alignPropertiesBottom={this.alignPropertiesBottom}
            onEntryClick={(entry, isModEvent) => {
              void this.app.workspace.openLinkText(
                entry.file.path,
                "",
                isModEvent,
              );
            }}
            onEntryContextMenu={(evt, entry) => {
              evt.preventDefault();
              this.showEntryContextMenu(evt.nativeEvent as MouseEvent, entry);
            }}
            onEventDrop={(entry, newStart, newEnd) =>
              this.updateEntryDates(entry, newStart, newEnd)
            }
            editable={this.isEditable()}
          />
        </AppContext.Provider>
      </StrictMode>,
    );
  }

  private isEditable(): boolean {
    if (!this.startDateProp) return false;
    const startDateProperty = parsePropertyId(this.startDateProp);
    if (startDateProperty.type !== "note") return false;

    if (!this.endDateProp) return true;
    const endDateProperty = parsePropertyId(this.endDateProp);
    if (endDateProperty.type !== "note") return false;

    return true;
  }

  private extractDate(entry: BasesEntry, propId: BasesPropertyId): Date | null {
    try {
      const value = entry.getValue(propId);
      if (!value) return null;
      if (!(value instanceof DateValue)) return null;
      // Private API
      if ("date" in value && value.date && value.date instanceof Date) {
        return value.date;
      }

      return null;
    } catch (error) {
      console.error(`Error extracting date for ${entry.file.name}:`, error);
      return null;
    }
  }

  private showEntryContextMenu(evt: MouseEvent, entry: BasesEntry): void {
    const file = entry.file;
    const menu = Menu.forEvent(evt);

    this.app.workspace.handleLinkContextMenu(menu, file.path, "");

    menu.addItem((item) =>
      item
        .setSection("danger")
        .setTitle("Delete file")
        .setIcon("lucide-trash-2")
        .setWarning(true)
        .onClick(() => this.app.fileManager.promptForDeletion(file)),
    );
  }

  private async updateEntryDates(
    entry: BasesEntry,
    newStart: Date,
    newEnd?: Date,
  ): Promise<void> {
    if (!this.startDateProp) return;

    const file = entry.file;
    const startPropName = this.startDateProp;
    const endPropName = this.endDateProp;

    const extractedStartProp = startPropName.startsWith("note.")
      ? startPropName.slice(5)
      : null;

    const extractedEndProp = endPropName?.startsWith("note.")
      ? endPropName.slice(5)
      : null;

    const shouldUpdate =
      extractedStartProp !== null &&
      (!this.endDateProp || extractedEndProp !== null);

    if (!shouldUpdate) {
      return;
    }

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      const formatDate = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      frontmatter[extractedStartProp] = formatDate(newStart);
      if (this.endDateProp && newEnd && extractedEndProp) {
        frontmatter[extractedEndProp] = formatDate(newEnd);
      }
    });
  }

  public setEphemeralState(state: unknown): void {
    // State management could be extended for React component
  }

  public getEphemeralState(): unknown {
    return {};
  }

  static getViewOptions(): ViewOption[] {
    return [
      {
        displayName: "Date properties",
        type: "group",
        items: [
          {
            displayName: "Start date",
            type: "property",
            key: "startDate",
            placeholder: "Property",
          },
          {
            displayName: "End date (optional)",
            type: "property",
            key: "endDate",
            placeholder: "Property",
          },
        ],
      },
      {
        displayName: "Calendar options",
        type: "group",
        items: [
          {
            displayName: "Week starts on",
            type: "dropdown",
            key: "weekStartDay",
            default: "monday",
            options: {
              sunday: "Sunday",
              monday: "Monday",
              tuesday: "Tuesday",
              wednesday: "Wednesday",
              thursday: "Thursday",
              friday: "Friday",
              saturday: "Saturday",
            },
          },
        ],
      },
      {
        displayName: "Display",
        type: "group",
        items: [
          {
            displayName: "Image property (optional)",
            type: "property",
            key: "imageProperty",
            placeholder: "Property",
          },
          {
            displayName: "Property overlay opacity",
            type: "slider",
            key: "propertyOverlayOpacity",
            default: 60,
            min: 0,
            max: 100,
            step: 5,
          },
          {
            displayName: "Day number size",
            type: "slider",
            key: "dayNumberSize",
            default: 18,
            min: 12,
            max: 40,
            step: 1,
          },
          {
            displayName: "Align properties to bottom",
            type: "toggle",
            key: "alignPropertiesBottom",
            default: false,
          },
          {
            displayName: "Day cell height",
            type: "slider",
            key: "dayCellHeight",
            default: 120,
            min: 80,
            max: 220,
            step: 10,
          },
        ],
      },
    ];
  }

  private getOverlayOpacity(): number {
    const rawValue = this.config.get("propertyOverlayOpacity");
    const numericValue =
      typeof rawValue === "number"
        ? rawValue
        : typeof rawValue === "string"
          ? Number(rawValue)
          : undefined;
    if (typeof numericValue !== "number" || Number.isNaN(numericValue)) {
      return 0.6;
    }
    const clamped = Math.max(0, Math.min(100, numericValue));
    return clamped / 100;
  }

  private getDayNumberSize(): number {
    const rawValue = this.config.get("dayNumberSize");
    const numericValue =
      typeof rawValue === "number"
        ? rawValue
        : typeof rawValue === "string"
          ? Number(rawValue)
          : undefined;
    if (typeof numericValue !== "number" || Number.isNaN(numericValue)) {
      return 18;
    }
    return Math.max(12, Math.min(40, numericValue));
  }

  private applyDayNumberStyles(): void {
    const size = `${this.dayNumberSize}px`;
    const isDark = document.body.classList.contains("theme-dark");
    const color = isDark
      ? "rgba(255, 255, 255, 0.95)"
      : "rgba(20, 20, 20, 0.9)";
    const targets = [this.containerEl, document.documentElement as HTMLElement];
    for (const target of targets) {
      target.style.setProperty("--bases-day-number-size", size);
      target.style.setProperty("--bases-day-number-color", color);
      target.style.setProperty(
        "--bases-day-cell-height",
        `${this.dayCellHeight}px`,
      );
    }
  }

  private getDayCellHeight(): number {
    const rawValue = this.config.get("dayCellHeight");
    const numericValue =
      typeof rawValue === "number"
        ? rawValue
        : typeof rawValue === "string"
          ? Number(rawValue)
          : undefined;
    if (typeof numericValue !== "number" || Number.isNaN(numericValue)) {
      return 120;
    }
    return Math.max(80, Math.min(220, numericValue));
  }

  private getBooleanConfig(key: string, fallback = false): boolean {
    const value = this.config.get(key);
    if (typeof value === "boolean") {
      return value;
    }
    return fallback;
  }
}
