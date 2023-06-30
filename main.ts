import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	WorkspaceLeaf,
	ItemView,
} from "obsidian";
import axios from "axios";

const WEATHER_VIEW_TYPE = "weather-view";

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
	refreshInterval: number;
	location: string;
}

const DEFAULT_SETTINGS: WeatherSettings = {
	apiKey: "",
	unit: "celsius",
	refreshInterval: 30,
	location: "",
};

export default class WeatherPlugin extends Plugin {
	view: WeatherView;
	settings: WeatherSettings;
	updateInterval: NodeJS.Timeout | null = null;

	public async onload(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
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

		let isViewInitialized = false;

		const checkLayoutInterval = setInterval(async () => {
			if (this.app.workspace.layoutReady && !isViewInitialized) {
				await this.initView();
				isViewInitialized = true;
				clearInterval(checkLayoutInterval);
			}
		}, 1000);

		this.app.workspace.onLayoutReady(async () => {
			if (!isViewInitialized) {
				await this.initView();
				isViewInitialized = true;
				clearInterval(checkLayoutInterval);
			}
		});

		this.addSettingTab(new WeatherSettingTab(this.app, this));
	}

	public onunload(): void {
		this.clearUpdateInterval();
	}

	public onShow(): void {
		this.initView();
	}

	private async initView(): Promise<void> {
		if (this.app.workspace.getLeavesOfType(WEATHER_VIEW_TYPE).length) {
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: WEATHER_VIEW_TYPE });
			this.app.workspace.revealLeaf(leaf);

			// Check if the view is already created
			if (this.view instanceof WeatherView) {
				// Update the existing view
				this.view.displayTemperature();
			} else {
				// Create a new view
				this.view = new WeatherView(leaf, this);
				this.updateInterval = setInterval(
					this.view.displayTemperature.bind(this.view),
					this.settings.refreshInterval * 1000
				);
			}
		}
	}

	public clearUpdateInterval(): void {
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
			this.updateInterval = null;
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}

class WeatherView extends ItemView {
	plugin: WeatherPlugin;
	weatherContainer: HTMLElement;

	constructor(leaf: WorkspaceLeaf, plugin: WeatherPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	async onOpen() {
		this.displayTemperature();
		this.plugin.updateInterval = setInterval(
			() => this.displayTemperature(),
			this.plugin.settings.refreshInterval * 1000
		);
	}

	onClose() {
		this.plugin.clearUpdateInterval();
		return super.onClose();
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
		const WEATHER_API_URL = `http://api.weatherapi.com/v1/forecast.json?key=${this.plugin.settings.apiKey}&q=${this.plugin.settings.location}&days=3&aqi=yes`;
		const response = await axios.get<WeatherAPIResponse>(WEATHER_API_URL);
		return response.data;
	}

	displayTemperature() {
		this.fetchWeatherData()
			.then((weatherData) => {
				const weatherWidget = this.createWeatherWidget(weatherData);
				this.containerEl.empty();
				this.containerEl.appendChild(weatherWidget);
			})
			.catch((error) => {
				console.error("Failed to fetch weather data", error);
			});
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
		const aq = weatherData.current.air_quality["us-epa-index"].toString();
		const currentConditions = weatherData.current.condition.text;
		const forecastData = this.extractForecastData(weatherData.forecast);
		const lastUpdated = weatherData.current.last_updated;

		const weatherContainer = document.createElement("div");
		weatherContainer.className = "weather-container";

		const locationDiv = document.createElement("div");
		locationDiv.className = "location";
		locationDiv.textContent = location;
		weatherContainer.appendChild(locationDiv);

		const currentContainer = document.createElement("div");
		currentContainer.className = "current-container";
		weatherContainer.appendChild(currentContainer);

		const currentIconImg = document.createElement("img");
		currentIconImg.className = "current-icon";
		currentIconImg.src = `http:${currentIcon}`;
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
			});
			const day = forecastDate.getDate().toString();
			const forecastDateFormatted =
				forecastDate.getDate() === today.getDate() &&
				forecastDate.getMonth() === today.getMonth() &&
				forecastDate.getFullYear() === today.getFullYear()
					? "Today"
					: `${month} ${day}`;

			forecastDayDiv.textContent = forecastDateFormatted;

			forecastDayContainer.appendChild(forecastDayDiv);

			const forecastIconImg = document.createElement("img");
			forecastIconImg.className = "forecast-icon";
			forecastIconImg.src = `http:${forecast.icon}`;
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
		donateImage.style.height = "48px";
		donateImage.style.width = "173.6px";

		donateLink.appendChild(donateImage);
		donateText.appendChild(donateLink);

		div.appendChild(donateText);
		containerEl.createEl("h1", { text: "Tenki" });

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
						this.plugin.view.displayTemperature();
					})
			);

		new Setting(containerEl)
			.setName("Location")
			.setDesc("Enter your location")
			.addText((text) =>
				text
					.setPlaceholder("Enter your location")
					.setValue(this.plugin.settings.location)
					.onChange(async (value) => {
						this.plugin.settings.location = value.trim();
						await this.plugin.saveSettings();
						this.plugin.view.displayTemperature();
					})
			);

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
						const minutes = parseInt(value.trim());
						if (!isNaN(minutes) && minutes > 0) {
							this.plugin.settings.refreshInterval = minutes * 60;
							await this.plugin.saveSettings();
							this.plugin.clearUpdateInterval();
							this.plugin.view.displayTemperature();
							this.plugin.updateInterval = setInterval(
								() => this.plugin.view.displayTemperature(),
								this.plugin.settings.refreshInterval * 1000
							);
						}
					})
			);
	}
}
