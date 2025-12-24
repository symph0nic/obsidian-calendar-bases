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
import { AppContext } from "./context";
import { LinearReactView } from "./LinearReactView";

export const LinearViewType = "linear-calendar";

export interface LinearEntry {
  entry: BasesEntry;
  startDate: Date;
  endDate?: Date;
}

export class LinearView extends BasesView {
  type = LinearViewType;
  scrollEl: HTMLElement;
  containerEl: HTMLElement;
  root: Root | null = null;

  private entries: LinearEntry[] = [];
  private startDateProp: BasesPropertyId | null = null;
  private endDateProp: BasesPropertyId | null = null;
  private imageProp: BasesPropertyId | null = null;
  private propertyOverlayOpacity: number = 0;
  private dayNumberSize: number = 18;
  private alignPropertiesBottom: boolean = false;
  private dayCellHeight: number = 120;
  private alignWeekdays: boolean = false;
  private propertyChipScale: number = 1;
  private highlightWeekends: boolean = false;

  constructor(controller: QueryController, scrollEl: HTMLElement) {
    super(controller);
    this.scrollEl = scrollEl;
    this.containerEl = scrollEl.createDiv({
      cls: "bases-linear-container is-loading",
      attr: { tabIndex: 0 },
    });
  }

  onload(): void {}

  onunload(): void {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
    this.entries = [];
  }

  onResize(): void {
    this.updateLinearCalendar();
  }

  public focus(): void {
    this.containerEl.focus({ preventScroll: true });
  }

  public onDataUpdated(): void {
    this.containerEl.removeClass("is-loading");
    this.loadConfig();
    this.updateLinearCalendar();
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
    this.alignWeekdays = this.getBooleanConfig("alignWeekdays");
    this.propertyChipScale = this.getChipScale();
    this.highlightWeekends = this.alignWeekdays
      ? this.getBooleanConfig("highlightWeekends")
      : false;
    this.dayCellHeight = this.getDayCellHeight();
    this.applyStyles();
  }

  private updateLinearCalendar(): void {
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

    this.renderReactLinearCalendar();
  }

  private renderReactLinearCalendar(): void {
    if (!this.root) {
      this.root = createRoot(this.containerEl);
    }

    this.root.render(
      <StrictMode>
        <AppContext.Provider value={this.app}>
          <LinearReactView
            entries={this.entries}
            properties={this.config.getOrder() || []}
            imageProperty={this.imageProp}
            propertyOverlayOpacity={this.propertyOverlayOpacity}
            alignPropertiesBottom={this.alignPropertiesBottom}
            dayCellHeight={this.dayCellHeight}
            alignWeekdays={this.alignWeekdays}
            propertyChipScale={this.propertyChipScale}
            highlightWeekends={this.highlightWeekends}
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
          />
        </AppContext.Provider>
      </StrictMode>,
    );
  }

  private extractDate(entry: BasesEntry, propId: BasesPropertyId): Date | null {
    try {
      const value = entry.getValue(propId);
      if (!value) return null;
      if (!(value instanceof DateValue)) return null;
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

  public setEphemeralState(_state: unknown): void {}

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
            displayName: "Property chip size",
            type: "slider",
            key: "propertyChipScale",
            default: 100,
            min: 60,
            max: 160,
            step: 10,
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
            displayName: "Align days by weekday",
            type: "toggle",
            key: "alignWeekdays",
            default: false,
          },
          {
            displayName: "Highlight weekends",
            type: "toggle",
            key: "highlightWeekends",
            default: false,
            shouldHide: (config) => !config.get("alignWeekdays"),
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

  private applyStyles(): void {
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
        "--linear-day-cell-height",
        `${this.dayCellHeight}px`,
      );
      target.style.setProperty(
        "--bases-chip-scale",
        `${this.propertyChipScale}`,
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

  private getChipScale(): number {
    const rawValue = this.config.get("propertyChipScale");
    const numericValue =
      typeof rawValue === "number"
        ? rawValue
        : typeof rawValue === "string"
          ? Number(rawValue)
          : undefined;
    if (typeof numericValue !== "number" || Number.isNaN(numericValue)) {
      return 1;
    }
    const clamped = Math.max(60, Math.min(160, numericValue));
    return clamped / 100;
  }
}
