import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	WorkspaceLeaf,
	ExtraButtonComponent,
	ItemView,
	requestUrl,
	Notice,
	debounce,
} from "obsidian";

const WEATHER_VIEW_TYPE = "tenki";

interface ForecastDay {
	date: string;
	day: {
		condition: {
			icon: string;
		};
		daily_chance_of_rain: number;
		maxtemp_c: number;
		mintemp_c: number;
		maxtemp_f: number;
		mintemp_f: number;
	};
}

interface Forecast {
	forecastday: ForecastDay[];
}

interface WeatherAPIResponse {
	location: {
		name: string;
	};
	current: {
		condition: {
			icon: string;
			text: string;
		};
		temp_c: number;
		temp_f: number;
		feelslike_c: number;
		feelslike_f: number;
		humidity: number;
		uv: number;
		air_quality: {
			"us-epa-index": number;
		};
		last_updated: string;
	};
	forecast: Forecast;
}

interface WeatherSettings {
	apiKey: string;
	unit: "celsius" | "fahrenheit";
	/**
	 * Stored in seconds; default is 30 minutes (1800s).
	 * Keep name for backward compatibility with saved data.
	 */
	refreshInterval: number;
	location: string;
}

const DEFAULT_SETTINGS: WeatherSettings = {
	apiKey: "",
	unit: "celsius",
	// 30 minutes expressed in seconds
	refreshInterval: 30 * 60,
	location: "",
};

const MIN_REFRESH_SECONDS = 30 * 60;

export default class WeatherPlugin extends Plugin {
	view: WeatherView;
	settings: WeatherSettings;

	public async onload(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);

		this.settings.refreshInterval = Math.max(
			MIN_REFRESH_SECONDS,
			this.settings.refreshInterval || MIN_REFRESH_SECONDS
		);

		this.registerView(
			WEATHER_VIEW_TYPE,
			(leaf) => (this.view = new WeatherView(leaf, this))
		);

		this.addCommand({
			id: "open",
			name: "open",
			callback: this.onShow.bind(this),
		});

		this.addCommand({
			id: "refresh",
			name: "Refresh",
			callback: () => {
				if (!this.view) {
					new Notice("Open Tenki before refreshing");
					void this.initView();
					return;
				}
				this.view.refreshWeather();
			},
		});

		this.app.workspace.onLayoutReady(async () => {
			await this.initView();
		});

		this.addSettingTab(new WeatherSettingTab(this.app, this));
	}

	public onShow(): void {
		this.initView();
	}

	private async initView(): Promise<void> {
		const existingLeaves = this.app.workspace.getLeavesOfType(
			WEATHER_VIEW_TYPE
		);
		if (existingLeaves.length) {
			const view = existingLeaves[0].view as WeatherView;
			this.view = view;
			return;
		}

		const leaf =
			this.app.workspace.getRightLeaf(false) ??
			this.app.workspace.getRightLeaf(true);

		if (!leaf) return;

		await leaf.setViewState({ type: WEATHER_VIEW_TYPE });
		this.app.workspace.revealLeaf(leaf);
		this.view = leaf.view as WeatherView;
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}

class WeatherView extends ItemView {
	plugin: WeatherPlugin;
	weatherContainer: HTMLElement;
	private refreshIntervalId: number | null = null;
	private lastErrorNoticeAt: number | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: WeatherPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	async onOpen() {
		await this.displayTemperature();
		this.startRefreshTimer();
	}

	refreshWeather() {
		this.displayTemperature();
		this.startRefreshTimer();
		new Notice("Tenki updated");
	}

	onClose() {
		this.clearRefreshTimer();
		return super.onClose();
	}

	private startRefreshTimer() {
		this.clearRefreshTimer();
		const refreshMs = Math.max(
			MIN_REFRESH_SECONDS,
			this.plugin.settings.refreshInterval
		);

		this.refreshIntervalId = window.setInterval(
			() => this.displayTemperature(),
			refreshMs * 1000
		);
		this.registerInterval(this.refreshIntervalId);
	}

	private clearRefreshTimer() {
		if (this.refreshIntervalId !== null) {
			window.clearInterval(this.refreshIntervalId);
			this.refreshIntervalId = null;
		}
	}

	public restartRefreshTimer() {
		this.startRefreshTimer();
	}

	getViewType() {
		return WEATHER_VIEW_TYPE;
	}

	public getDisplayText(): string {
		return "Tenki";
	}

	// Return the icon for the view
	public getIcon(): string {
		return "sun";
	}

	async fetchWeatherData(): Promise<WeatherAPIResponse> {
		const { apiKey, location } = this.plugin.settings;
		if (!apiKey || !location) {
			throw new Error("Missing API key or location");
		}

		const WEATHER_API_URL = `https://api.weatherapi.com/v1/forecast.json?key=${encodeURIComponent(
			apiKey
		)}&q=${encodeURIComponent(location)}&days=3&aqi=yes`;
		const response = await requestUrl({
			url: WEATHER_API_URL,
			method: "GET",
		});
		if (response.status >= 400) {
			throw new Error(`Weather API error ${response.status}`);
		}
		const weatherData: WeatherAPIResponse = response.json;
		return weatherData;
	}

	async displayTemperature() {
		if (!this.plugin.settings.apiKey || !this.plugin.settings.location) {
			this.showErrorNotice("Set API key and location to load Tenki");
			return;
		}

		try {
			const weatherData = await this.fetchWeatherData();
			const weatherWidget = this.createWeatherWidget(weatherData);
			this.containerEl.empty();
			this.containerEl.appendChild(weatherWidget);
		} catch (error) {
			console.error("Failed to fetch weather data", error);
			this.showErrorNotice(
				"Tenki could not fetch weather. Check network, API key, and location."
			);
		}
	}

	private showErrorNotice(message: string) {
		const now = Date.now();
		if (
			this.lastErrorNoticeAt === null ||
			now - this.lastErrorNoticeAt > 60_000
		) {
			new Notice(message);
			this.lastErrorNoticeAt = now;
		}
	}

	createWeatherWidget(weatherData: WeatherAPIResponse) {
		const location = weatherData.location.name;
		const currentIcon = weatherData.current.condition.icon;
		const currentTemp = this.getTemperatureString(
			weatherData.current.temp_c,
			weatherData.current.temp_f
		);
		const feelsLikeTemp = this.getTemperatureString(
			weatherData.current.feelslike_c,
			weatherData.current.feelslike_f
		);
		const humidity = `${weatherData.current.humidity}%`;
		const uv = weatherData.current.uv.toString();
		const currentConditions = weatherData.current.condition.text;
		const forecastData = this.extractForecastData(weatherData.forecast);
		const lastUpdated = weatherData.current.last_updated;

		const weatherContainer = document.createElement("div");
		weatherContainer.className = "weather-container";

		// Create refresh button
		const refreshButton = weatherContainer.createDiv(
			"tenki-refresh-button"
		);

		refreshButton.onclick = this.refreshWeather.bind(this);

		refreshButton.setAttribute("data-app-id", "tenki");

		// Create the ExtraButtonComponent and set the icon and tooltip
		new ExtraButtonComponent(refreshButton)
			.setIcon("refresh-ccw")
			.setTooltip("Refresh", { placement: "top" });

		const locationDiv = document.createElement("div");
		locationDiv.className = "location";
		locationDiv.textContent = location;
		weatherContainer.appendChild(locationDiv);

		const currentContainer = document.createElement("div");
		currentContainer.className = "current-container";
		weatherContainer.appendChild(currentContainer);

		const currentIconImg = document.createElement("img");
		currentIconImg.className = "current-icon";
		currentIconImg.src = `https:${currentIcon}`;
		currentIconImg.alt = "Weather Icon";
		currentContainer.appendChild(currentIconImg);

		const currentStatsContainer = document.createElement("div");
		currentStatsContainer.className = "current-stats-container";
		currentContainer.appendChild(currentStatsContainer);

		const currentTempContainer = document.createElement("div");
		currentTempContainer.className = "current-temp-container";
		currentStatsContainer.appendChild(currentTempContainer);

		const currentTempDiv = document.createElement("div");
		currentTempDiv.className = "current-temp";
		currentTempDiv.textContent = currentTemp;
		currentTempContainer.appendChild(currentTempDiv);

		const feelsLikeTempDiv = document.createElement("div");
		feelsLikeTempDiv.className = "current-feelslike";
		feelsLikeTempDiv.textContent = feelsLikeTemp;
		currentTempContainer.appendChild(feelsLikeTempDiv);

		const humidityDiv = document.createElement("div");
		humidityDiv.className = "current-humidity";
		humidityDiv.textContent = "Humidity: ";
		currentStatsContainer.appendChild(humidityDiv);

		const humidityValueDiv = document.createElement("div");
		humidityValueDiv.className = "current-humidity-value";
		humidityValueDiv.textContent = humidity;
		humidityDiv.appendChild(humidityValueDiv);

		const uvDiv = document.createElement("div");
		uvDiv.className = "current-uv";
		uvDiv.textContent = "UV: ";
		currentStatsContainer.appendChild(uvDiv);

		const uvValueDiv = document.createElement("div");
		uvValueDiv.className = "current-uv-value";
		uvValueDiv.textContent = uv;
		uvDiv.appendChild(uvValueDiv);

		const aqDiv = document.createElement("div");
		aqDiv.className = "current-aq";

		// Check if air quality data is available
		if (
			weatherData.current.air_quality &&
			weatherData.current.air_quality["us-epa-index"] !== undefined &&
			weatherData.current.air_quality["us-epa-index"] !== null
		) {
			const aq = String(
				weatherData.current.air_quality["us-epa-index"]
			);

			const aqText = document.createElement("span");
			aqText.textContent = "AQ: ";
			aqDiv.appendChild(aqText);

			const aqValueDiv = document.createElement("div");
			aqValueDiv.className = "current-aq-value";
			aqValueDiv.textContent = aq;

			const aqIconDiv = document.createElement("div");
			aqIconDiv.className = "current-aq-icon";
			const aqIcon = this.createIcon(aq);
			aqIconDiv.appendChild(aqIcon);

			aqDiv.appendChild(aqValueDiv);
			aqDiv.appendChild(aqIconDiv);
		}

		currentStatsContainer.appendChild(aqDiv);

		const currentConditionsDiv = document.createElement("div");
		currentConditionsDiv.className = "current-conditions";
		currentConditionsDiv.textContent = currentConditions;
		weatherContainer.appendChild(currentConditionsDiv);

		const forecastContainer = document.createElement("div");
		forecastContainer.className = "forecast-container";
		weatherContainer.appendChild(forecastContainer);

		forecastData.forEach((forecast) => {
			const forecastDayContainer = document.createElement("div");
			forecastDayContainer.className = "forecast-day-container";
			forecastContainer.appendChild(forecastDayContainer);

			const forecastDayDiv = document.createElement("div");
			forecastDayDiv.className = "forecast-day";

			const forecastDate = new Date(forecast.day);
			const today = new Date();

			const month = forecastDate.toLocaleString(undefined, {
				month: "short",
				timeZone: "UTC",
			});
			const day = forecastDate.getUTCDate().toString()
			const forecastDateFormatted =
				forecastDate.getUTCDate() === today.getUTCDate() &&
				forecastDate.getUTCMonth() === today.getUTCMonth() &&
				forecastDate.getUTCFullYear() === today.getUTCFullYear()
					? "Today"
					: `${month} ${day}`;

			forecastDayDiv.textContent = forecastDateFormatted;

			forecastDayContainer.appendChild(forecastDayDiv);

			const forecastIconImg = document.createElement("img");
			forecastIconImg.className = "forecast-icon";
			forecastIconImg.src = `https:${forecast.icon}`;
			forecastIconImg.alt = "Weather Icon";
			forecastDayContainer.appendChild(forecastIconImg);

			const forecastRainDiv = document.createElement("div");
			forecastRainDiv.className = "forecast-rain";
			forecastRainDiv.textContent = forecast.rain;
			forecastDayContainer.appendChild(forecastRainDiv);

			const tooltip = document.createElement("div");
			tooltip.className = "forecast-tooltip";

			if (this.plugin.settings.unit === "celsius") {
				tooltip.textContent = `${forecast.minTempC}°C ${forecast.maxTempC}°C`;
			} else {
				tooltip.textContent = `${forecast.minTempF}°F ${forecast.maxTempF}°F`;
			}
			forecastDayContainer.appendChild(tooltip);

			// Add mouseover event listener to show the tooltip
			forecastDayContainer.addEventListener("mouseover", () => {
				tooltip.style.visibility = "visible";
			});

			// Add mouseout event listener to hide the tooltip
			forecastDayContainer.addEventListener("mouseout", () => {
				tooltip.style.visibility = "hidden";
			});
		});

		const lastUpdatedDiv = document.createElement("div");
		lastUpdatedDiv.className = "last-updated";
		lastUpdatedDiv.textContent = "Source Updated: " + lastUpdated;
		weatherContainer.appendChild(lastUpdatedDiv);

		return weatherContainer;
	}

	getTemperatureString(celsius: number, fahrenheit: number) {
		if (this.plugin.settings.unit === "celsius") {
			return `${celsius}°C`;
		} else {
			return `${fahrenheit}°F`;
		}
	}

	extractForecastData(forecast?: Forecast): {
		day: string;
		icon: string;
		rain: string;
		minTempC: string;
		maxTempC: string;
		minTempF: string;
		maxTempF: string;
	}[] {
		if (!forecast) return [];

		return forecast.forecastday.map((forecastDay: ForecastDay) => ({
			day: forecastDay.date,
			icon: forecastDay.day.condition.icon,
			rain: `${forecastDay.day.daily_chance_of_rain}%`,
			minTempC: `${forecastDay.day.mintemp_c}`,
			maxTempC: `${forecastDay.day.maxtemp_c}`,
			minTempF: `${forecastDay.day.mintemp_f}`,
			maxTempF: `${forecastDay.day.maxtemp_f}`,
		}));
	}

	createIcon(iconType: string) {
		const icon = document.createElement("span");
		icon.className = "weather-icon";

		switch (iconType) {
			case "1":
				icon.textContent = "😊"; // Good
				break;
			case "2":
				icon.textContent = "😐"; // Moderate
				break;
			case "3":
				icon.textContent = "😷"; // Unhealthy for sensitive group
				break;
			case "4":
				icon.textContent = "😷"; // Unhealthy
				break;
			case "5":
				icon.textContent = "😨"; // Very Unhealthy
				break;
			case "6":
				icon.textContent = "☠️"; // Hazardous
				break;
			default:
				icon.textContent = "";
		}

		return icon;
	}
}

// Settings
class WeatherSettingTab extends PluginSettingTab {
	plugin: WeatherPlugin;

	constructor(app: App, plugin: WeatherPlugin) {
		super(app, plugin);
		if (!plugin) {
			throw new Error("Plugin is undefined");
		}
		this.plugin = plugin;
	}

	async display() {
		const { containerEl } = this;
		containerEl.empty();

		// Title
		containerEl.createEl("h1", { text: "Tenki" });

		// API Key Setting
		new Setting(containerEl)
			.setName("API Key")
			.setDesc(
				createFragment((fragment) => {
					fragment.append(
						"Enter your API Key",
						fragment.createEl("br"),
						fragment.createEl("a", {
							text: "Get your free key here:",
							href: "https://www.weatherapi.com/",
						})
					);
				})
			)
			.addText((text) =>
				text
					.setPlaceholder("Enter API key")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value.trim();
						await this.plugin.saveSettings();
						await this.plugin.view?.displayTemperature();
					})
			);

		// Location Setting
		new Setting(containerEl)
			.setName("Location")
			.setDesc("Enter your location")
			.addText((text) =>
				text
					.setPlaceholder("Enter your location")
					.setValue(this.plugin.settings.location)
					.onChange(
						debounce(async (value) => {
							const trimmed = value.trim();
							this.plugin.settings.location = trimmed;
							await this.plugin.saveSettings();
							if (!trimmed) return;
							await this.plugin.view?.displayTemperature();
						}, 1500)
					)
			);

		// Unit Setting
		new Setting(containerEl)
			.setName("Unit")
			.setDesc("Select the unit for temperature")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("celsius", "Celsius")
					.addOption("fahrenheit", "Fahrenheit")
					.setValue(this.plugin.settings.unit)
					.onChange(async (value) => {
						this.plugin.settings.unit = value as
							| "celsius"
							| "fahrenheit";
						await this.plugin.saveSettings();
						this.plugin.view.displayTemperature();
					})
			);

		// Refresh Interval Setting
		new Setting(containerEl)
			.setName("Refresh Interval")
			.setDesc("Set the refresh interval in minutes")
			.addText((text) =>
				text
					.setPlaceholder("Enter refresh interval")
					.setValue(
						(this.plugin.settings.refreshInterval / 60).toString()
					)
					.onChange(async (value) => {
						const minutes = parseInt(value.trim(), 10);
						if (!isNaN(minutes) && minutes > 0) {
							const clampedMinutes = Math.max(30, minutes);
							this.plugin.settings.refreshInterval = clampedMinutes * 60;
							await this.plugin.saveSettings();
							await this.plugin.view?.displayTemperature();
							this.plugin.view?.restartRefreshTimer();
						}
					})
			);

		// Donation Information
		const div = containerEl.createEl("div", {
			cls: "recent-files-donation",
		});

		const donateText = document.createElement("div");
		donateText.className = "donate-text";

		const donateDescription = document.createElement("p");
		donateDescription.textContent =
			"If you find this plugin valuable and would like to support its development, please consider using the button below. Your contribution is greatly appreciated!";
		donateText.appendChild(donateDescription);

		const donateLink = document.createElement("a");
		donateLink.href = "https://www.buymeacoffee.com/mstam30561";
		donateLink.target = "_blank";

		function rotateColorRandomly(element: HTMLElement) {
			const rotationDegrees = Math.floor(Math.random() * 8 + 1) * 45; // Randomly select a rotation value in increments of 45 degrees
			element.style.filter = `hue-rotate(${rotationDegrees}deg)`;
		}

		const donateImage = document.createElement("img");
		donateImage.src =
			"https://cdn.buymeacoffee.com/buttons/v2/default-blue.png";
		donateImage.alt = "Buy Me A Coffee";
		rotateColorRandomly(donateImage);
		donateImage.classList.add("donate-img");
		donateLink.appendChild(donateImage);
		donateText.appendChild(donateLink);

		div.appendChild(donateText);
	}
}
