library(tidyverse)
data <- read.csv("https://raw.githubusercontent.com/JoeLakeyy/JoeLakeyy.github.io/refs/heads/main/religion_V5.csv")

earliest <- min(data$construction_start)
latest <- 2026

years <-  earliest:latest



expanded <- data %>%
  mutate(religion_group = case_when(
      str_detect(religion_origin, "^Christian") ~ "Christian",
      religion_origin == "Islamic" ~ "Islamic",
      religion_origin == "Buddhist" ~ "Buddhist",
      religion_origin == "Hindu" ~ "Hindu",
      TRUE ~ "Other")) %>% 
  # Split "event1;event2" into multiple rows
  mutate(phase_list = str_split(construction_timeline, ";")) %>%
  unnest_longer(phase_list) %>%
  filter(!is.na(phase_list)) %>%
  
  # 2. Split "start:end:height"
  separate(
    phase_list,
    into = c("construction_start", "construction_end", "height_m"),
    sep = ":",
    convert = TRUE
  ) %>%
  
  # 3. Keep destruction_year ONLY on the first phase row. Needs to be adjusted if >2 events
  group_by(name) %>%
  mutate(destruction_year = if_else(row_number() == 1, destruction_year, NA_integer_)) %>%
  mutate(max_height = max(height_m, na.rm = TRUE)) %>% 
  ungroup()



# one row per building per year
prevalence <- do.call(rbind, lapply(years, function(i) {
  
  active <- expanded[
    expanded$construction_start <= i &
      (is.na(expanded$destruction_year) | expanded$destruction_year >= i),
  ]
  
  if (nrow(active) == 0) return(NULL)
  
  active$year <- i
  active
}))


min_year <- min(prevalence$year, na.rm = TRUE)
max_year <- max(prevalence$year, na.rm = TRUE)

build <- prevalence %>%
  mutate(
    build_time = construction_end - construction_start,
    height_per_year = height_m / build_time,
    years_since_start = year - construction_start,
    height_at_year = round(pmin(height_m, height_per_year * years_since_start)),
    destruction_flag = if_else(!is.na(destruction_year) & year == destruction_year, "Yes", "No"),
    
    
    # linear 0–1 for timeline position of year, then add exponential scaling
    t_lin = (year - min_year) / (max_year - min_year),
    slider_pos = t_lin ^ 2.5,
    
    tick_label = case_when(
      year %% 1000 == 0 ~ case_when(
        year < 0 ~ paste0(abs(year), " BC"),
        year == 0 ~ "0 AD",
        TRUE ~ paste0(year, " AD")
      ),
      TRUE ~ NA_character_
    )  
    )


# create shorter list of events. Prioritise destruction to completion to start to decade
events <- build %>%
  group_by(year) %>%
  summarise(
    has_construction_start = any(year == construction_start),
    has_construction_end   = any(year == construction_end),
    has_destruction        = any(year == destruction_year),
    is_decade              = (year %% 10 == 0)) %>%
  mutate(
    event_type = case_when(
      has_destruction ~ "destruction",
      has_construction_end ~ "construction_end",
      has_construction_start ~ "construction_start",
      is_decade ~ "decade",
      TRUE ~ "none"
    )
  ) %>% 
  filter(event_type!="none") %>% 
  distinct() %>% 
  ungroup() %>% 
  select(year,event_type)
  


# table(build$type)
# table(build$religion_origin)
# 
# colnames(build)

write.csv(build,"~/Prevalence_religion_V5.csv", row.names = FALSE)
write.csv(events,"~/year_religion.csv", row.names = FALSE)
