import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFavoriteMatchesFeed } from "../../api/favorites";
import { getHome } from "../../api/home";
import MatchCard from "../../components/cards/MatchCard";
import CountrySection from "../../components/home/CountrySection";
import SearchBar from "../../components/home/SearchBar";
import ChoiceBox from "../../components/ui/ChoiceBox";
import { useLiveMatches } from "../../hooks/useLiveMatches";
import { useAuth } from "../../hooks/useAuth";
import { useFavorites } from "../../hooks/useFavorites";
import { useI18n } from "../../hooks/useI18n";
import { formatDate } from "../../i18n/formatting";

const MATCH_VIEW_ALL = "all";
const MATCH_VIEW_MY = "my";
const MATCH_VIEW_STORAGE_KEY = "homeMatchView";

function getMatchDate(match) {
  const date = new Date(match.time);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateKey(date) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isTodayMatch(match) {
  const matchDate = getMatchDate(match);
  return toDateKey(matchDate) === toDateKey(new Date());
}

function isLiveMatch(match) {
  return Boolean(match?.isLive);
}

function sortMatchesForDay(a, b) {
  const aLive = isLiveMatch(a);
  const bLive = isLiveMatch(b);

  if (aLive !== bLive) {
    return aLive ? -1 : 1;
  }

  const aTime = getMatchDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const bTime = getMatchDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return aTime - bTime;
}

function formatDayLabel(dateKey, language, t) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const todayKey = toDateKey(new Date());

  if (dateKey === todayKey) {
    return t("dates.today");
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateKey === toDateKey(yesterday)) {
    return t("dates.yesterday");
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateKey === toDateKey(tomorrow)) {
    return t("dates.tomorrow");
  }

  return formatDate(date, language, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function sortByFirstMatch(a, b) {
  const aTime = getMatchDate(a?.matches?.[0])?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const bTime = getMatchDate(b?.matches?.[0])?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return aTime - bTime;
}

function sortHomeCountries(countries) {
  return countries
    .map((country) => ({
      ...country,
      competitions: country.competitions
        .map((competition) => ({
          ...competition,
          matches: competition.matches
            .map((match) => ({ ...match, isToday: isTodayMatch(match) }))
            .sort(sortMatchesForDay),
        }))
        .sort(sortByFirstMatch),
    }))
    .sort((a, b) => sortByFirstMatch(a.competitions[0], b.competitions[0]));
}

function buildDaySections(countries, language, t) {
  const daysMap = new Map();

  countries.forEach((country) => {
    country.competitions.forEach((competition) => {
      competition.matches.forEach((match) => {
        const matchDate = getMatchDate(match);
        const dateKey = toDateKey(matchDate);
        if (!dateKey) return;

        if (!daysMap.has(dateKey)) {
          daysMap.set(dateKey, {
            dateKey,
            label: formatDayLabel(dateKey, language, t),
            countries: [],
            matchCount: 0,
          });
        }

        const day = daysMap.get(dateKey);
        let dayCountry = day.countries.find((item) => item.id === country.id);

        if (!dayCountry) {
          dayCountry = {
            ...country,
            competitions: [],
          };
          day.countries.push(dayCountry);
        }

        let dayCompetition = dayCountry.competitions.find((item) => item.id === competition.id);

        if (!dayCompetition) {
          dayCompetition = {
            ...competition,
            matches: [],
          };
          dayCountry.competitions.push(dayCompetition);
        }

        dayCompetition.matches.push(match);
        dayCompetition.matches.sort(sortMatchesForDay);
        day.matchCount += 1;
      });
    });
  });

  return Array.from(daysMap.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function applyLiveMatches(countries, liveMatchesById) {
  if (!Object.keys(liveMatchesById).length) return countries;

  return countries.map((country) => ({
    ...country,
    competitions: country.competitions.map((competition) => ({
      ...competition,
      matches: competition.matches.map((match) => {
        const live = liveMatchesById[match.id];
        if (!live) return match;

        return {
          ...match,
          score: live.score || match.score,
          status: live.timer || live.status || match.status,
          statusLong: live.statusLong || match.statusLong,
          statusShort: live.statusShort || live.status || match.statusShort,
          isLive: Boolean(live.isLive),
          elapsed: live.elapsed ?? match.elapsed,
          extra: live.extra ?? match.extra,
          lastEvent: live.lastEvent || match.lastEvent,
          updatedAt: live.updatedAt || match.updatedAt,
        };
      }),
    })),
  }));
}

function normalizeFavoriteType(type) {
  return String(type || "").trim().toLowerCase().replace(/s$/, "");
}

function buildFavoriteMatchScope(favoriteKeys) {
  const competitions = new Set();
  const players = new Set();
  const teams = new Set();
  const matches = new Set();

  favoriteKeys.forEach((key) => {
    const [rawType, id] = String(key).split(":");
    const type = normalizeFavoriteType(rawType);
    if (!id) return;
    if (type === "competition") competitions.add(String(id));
    if (type === "player") players.add(String(id));
    if (type === "team") teams.add(String(id));
    if (type === "match") matches.add(String(id));
  });

  return { competitions, players, teams, matches };
}

function matchBelongsToFavorites(match, competition, scope) {
  return (
    scope.matches.has(String(match.id)) ||
    scope.competitions.has(String(competition.id)) ||
    scope.teams.has(String(match.homeTeam?.id)) ||
    scope.teams.has(String(match.awayTeam?.id))
  );
}

function filterCountriesByFavorites(countries, scope) {
  return countries
    .map((country) => ({
      ...country,
      competitions: country.competitions
        .map((competition) => ({
          ...competition,
          matches: competition.matches.filter((match) => matchBelongsToFavorites(match, competition, scope)),
        }))
        .filter((competition) => competition.matches.length > 0),
    }))
    .filter((country) => country.competitions.length > 0);
}

function filterCountriesByMatches(countries, predicate) {
  return countries
    .map((country) => ({
      ...country,
      competitions: country.competitions
        .map((competition) => ({
          ...competition,
          matches: competition.matches.filter((match) => predicate(match, competition, country)),
        }))
        .filter((competition) => competition.matches.length > 0),
    }))
    .filter((country) => country.competitions.length > 0);
}

function matchIdsFromCountries(countries) {
  return new Set(
    countries.flatMap((country) =>
      country.competitions.flatMap((competition) =>
        competition.matches.map((match) => String(match.id))
      )
    )
  );
}

function getMatchesFromDay(day) {
  return day.countries
    .flatMap((country) =>
      country.competitions.flatMap((competition) => competition.matches)
    )
    .sort(sortMatchesForDay);
}

function dedupeCountryMatches(countries) {
  const seenMatchIds = new Set();

  return countries
    .map((country) => ({
      ...country,
      competitions: country.competitions
        .map((competition) => ({
          ...competition,
          matches: competition.matches.filter((match) => {
            const key = String(match?.id ?? "");
            if (!key || seenMatchIds.has(key)) return false;
            seenMatchIds.add(key);
            return true;
          }),
        }))
        .filter((competition) => competition.matches.length > 0),
    }))
    .filter((country) => country.competitions.length > 0);
}

function getStoredMatchView() {
  try {
    const stored = window.localStorage.getItem(MATCH_VIEW_STORAGE_KEY);
    return stored === MATCH_VIEW_MY ? MATCH_VIEW_MY : MATCH_VIEW_ALL;
  } catch {
    return MATCH_VIEW_ALL;
  }
}

function Home() {
  const { language, t } = useI18n();
  const [countries, setCountries] = useState([]);
  const [matchView, setMatchView] = useState(getStoredMatchView);
  const [favoriteMatchCountries, setFavoriteMatchCountries] = useState([]);
  const [isLoadingFavoriteMatches, setIsLoadingFavoriteMatches] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState("");
  const [showFloatingTodayButton, setShowFloatingTodayButton] = useState(false);
  const [activeDayKey, setActiveDayKey] = useState("");
  const didScrollToMatchDay = useRef(false);
  const { isAuthenticated, isLoading: isLoadingAuth } = useAuth();
  const { favoriteKeys } = useFavorites();
  const { connectionStatus, matchesById: liveMatchesById, finalizedAt } = useLiveMatches();

  const loadHome = useCallback(async function loadHome({ showLoading = true } = {}) {
    try {
      if (showLoading) {
        setIsLoading(true);
      }
      setErrorKey("");

      const response = await getHome({ force: !showLoading });
      setCountries(response.data);
    } catch (err) {
      console.error(err);
      setErrorKey("matches.error");
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadInitialHome() {
      try {
        setIsLoading(true);
        setErrorKey("");

        const response = await getHome();

        if (mounted) {
          setCountries(response.data);
        }
      } catch (err) {
        console.error(err);

        if (mounted) {
          setErrorKey("matches.error");
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadInitialHome();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!finalizedAt) return;
    loadHome({ showLoading: false });
  }, [finalizedAt, loadHome]);

  useEffect(() => {
    if (!isAuthenticated && !isLoadingAuth) {
      setMatchView(MATCH_VIEW_ALL);
    }
  }, [isAuthenticated, isLoadingAuth]);

  useEffect(() => {
    let mounted = true;

    async function loadFavoriteMatchesForMyMatches() {
      if (isLoadingAuth || !isAuthenticated || matchView !== MATCH_VIEW_MY) {
        if (!isAuthenticated && !isLoadingAuth) setFavoriteMatchCountries([]);
        return;
      }

      setIsLoadingFavoriteMatches(true);

      try {
        const response = await getFavoriteMatchesFeed();
        if (mounted) setFavoriteMatchCountries(response.data || []);
      } catch (err) {
        console.error(err);
        if (mounted) setFavoriteMatchCountries([]);
      } finally {
        if (mounted) setIsLoadingFavoriteMatches(false);
      }
    }

    loadFavoriteMatchesForMyMatches();

    return () => {
      mounted = false;
    };
  }, [isAuthenticated, isLoadingAuth, matchView]);

  useEffect(() => {
    if (!isAuthenticated) return;
    try {
      window.localStorage.setItem(MATCH_VIEW_STORAGE_KEY, matchView);
    } catch {
      // Ignore storage failures; the tab still works for the current session.
    }
  }, [isAuthenticated, matchView]);

  function handleSearchInputChange(event) {
    setSearchQuery(event.target.value);
  }

  function handleMatchViewChange(nextView) {
    setMatchView(nextView);
    setActiveDayKey("");
    setShowFloatingTodayButton(false);
    didScrollToMatchDay.current = false;
  }

  const favoriteScope = useMemo(() => {
    return buildFavoriteMatchScope(favoriteKeys);
  }, [favoriteKeys]);

  const hasFavoriteMatchScope = favoriteScope.competitions.size > 0 || favoriteScope.players.size > 0 || favoriteScope.teams.size > 0 || favoriteScope.matches.size > 0;

  const countryPool = useMemo(() => {
    const liveCountries = applyLiveMatches(countries, liveMatchesById);
    let scopedCountries = isAuthenticated && matchView === MATCH_VIEW_MY
      ? filterCountriesByFavorites(liveCountries, favoriteScope)
      : filterCountriesByMatches(liveCountries, isTodayMatch);

    if (isAuthenticated && matchView === MATCH_VIEW_MY) {
      const existingMatchIds = matchIdsFromCountries(scopedCountries);
      scopedCountries = [
        ...scopedCountries,
        ...favoriteMatchCountries
          .map((country) => ({
            ...country,
            competitions: country.competitions.map((competition) => ({
              ...competition,
              matches: competition.matches.filter((match) => {
                if (existingMatchIds.has(String(match.id))) return false;
                existingMatchIds.add(String(match.id));
                return true;
              }),
            })).filter((competition) => competition.matches.length > 0),
          }))
          .filter((country) => country.competitions.length > 0),
      ];
    }

    return sortHomeCountries(dedupeCountryMatches(scopedCountries));
  }, [countries, favoriteMatchCountries, favoriteScope, isAuthenticated, liveMatchesById, matchView]);

  const filteredCountries = useMemo(() => {
    const sortedCountries = countryPool;

    if (!searchQuery.trim()) {
      return sortedCountries;
    }

    const query = searchQuery.toLowerCase();

    return sortedCountries
      .map((country) => ({
        ...country,
        competitions: country.competitions
          .map((competition) => ({
            ...competition,
            matches: competition.matches.filter((match) => {
              return (
                String(match.homeTeam?.name || "").toLowerCase().trim().replace(/\s+/g, "").includes(query) ||
                String(match.awayTeam?.name || "").toLowerCase().trim().replace(/\s+/g, "").includes(query) ||
                String(country.name || "").toLowerCase().trim().replace(/\s+/g, "").includes(query) ||
                competition.name.toLowerCase().trim().replace(/\s+/g, "").includes(query)
              );
            }),
          }))
          .filter((competition) => competition.matches.length > 0),
      }))
      .filter((country) => country.competitions.length > 0);
  }, [countryPool, searchQuery]);

  const matchCount = useMemo(() => {
    return filteredCountries.reduce((total, country) => {
      return (
        total +
        country.competitions.reduce(
          (sum, competition) => sum + competition.matches.length,
          0
        )
      );
    }, 0);
  }, [filteredCountries]);

  const todayMatches = useMemo(() => {
    return filteredCountries.flatMap((country) =>
      country.competitions.flatMap((competition) =>
        competition.matches.filter((match) => match.isToday)
      )
    );
  }, [filteredCountries]);

  const daySections = useMemo(() => buildDaySections(filteredCountries, language, t), [filteredCountries, language, t]);
  const firstTodayMatchId = matchView === MATCH_VIEW_ALL ? todayMatches[0]?.id : undefined;
  const todayDayKey = toDateKey(new Date());
  const hasSearchQuery = Boolean(searchQuery.trim());
  const targetDay = useMemo(() => {
    if (daySections.length === 0) {
      return null;
    }

    return (
      daySections.find((day) => day.dateKey === todayDayKey) ||
      daySections.find((day) => day.dateKey > todayDayKey) ||
      daySections[0]
    );
  }, [daySections, todayDayKey]);
  const targetDayElementId = targetDay ? `home-day-${targetDay.dateKey}` : "";
  const targetDayIsToday = targetDay?.dateKey === todayDayKey;
  const dayChoiceItems = daySections.map((day) => ({
    value: day.dateKey,
    label: day.label,
    count: day.matchCount,
  }));

  function scrollToDay(dateKey) {
    document.getElementById(`home-day-${dateKey}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function handleScrollToMatchDay() {
    if (targetDay?.dateKey) scrollToDay(targetDay.dateKey);
  }

  function handleDayChoice(dateKey) {
    setActiveDayKey(dateKey);
    scrollToDay(dateKey);
  }

  useEffect(() => {
    if (!targetDay?.dateKey) {
      return;
    }

    if (!activeDayKey || !daySections.some((day) => day.dateKey === activeDayKey)) {
      setActiveDayKey(targetDay.dateKey);
    }
  }, [activeDayKey, daySections, targetDay]);

  useEffect(() => {
    if (
      didScrollToMatchDay.current ||
      isLoading ||
      errorKey ||
      hasSearchQuery ||
      !targetDayElementId
    ) {
      return;
    }

    didScrollToMatchDay.current = true;
    window.requestAnimationFrame(() => {
      document.getElementById(targetDayElementId)?.scrollIntoView({
        block: "start",
      });
    });
  }, [errorKey, hasSearchQuery, isLoading, targetDayElementId]);

  useEffect(() => {
    if (isLoading || errorKey || hasSearchQuery || !targetDayElementId) {
      setShowFloatingTodayButton(false);
      return undefined;
    }

    const targetElement = document.getElementById(targetDayElementId);

    if (!targetElement) {
      setShowFloatingTodayButton(false);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowFloatingTodayButton(!entry.isIntersecting);
      },
      {
        root: null,
        rootMargin: "-96px 0px -35% 0px",
        threshold: 0.05,
      }
    );

    observer.observe(targetElement);

    return () => {
      observer.disconnect();
    };
  }, [errorKey, hasSearchQuery, isLoading, targetDayElementId]);

  return (
    <section className="home-page">
      <SearchBar
        value={searchQuery}
        onInputChange={handleSearchInputChange}
      />

      <div className="home-page__header">
        <div>
          <p className="eyebrow">{t("matches.dashboard")}</p>
          <h1>{t("matches.title")}</h1>
        </div>

        <div className="home-page__actions">
          {!isLoadingAuth && isAuthenticated ? (
            <div className="home-match-view" role="tablist" aria-label={t("matches.feed")}>
              <button
                aria-selected={matchView === MATCH_VIEW_ALL}
                className={`home-match-view__button${matchView === MATCH_VIEW_ALL ? " home-match-view__button--active" : ""}`}
                onClick={() => handleMatchViewChange(MATCH_VIEW_ALL)}
                role="tab"
                type="button"
              >
                {t("matches.all")}
              </button>
              <button
                aria-selected={matchView === MATCH_VIEW_MY}
                className={`home-match-view__button${matchView === MATCH_VIEW_MY ? " home-match-view__button--active" : ""}`}
                onClick={() => handleMatchViewChange(MATCH_VIEW_MY)}
                role="tab"
                type="button"
              >
                {t("matches.my")}
              </button>
            </div>
          ) : null}

          <span className="home-page__count">
            {t("matches.count", { count: matchCount })}
          </span>
        </div>
      </div>

      {connectionStatus === "reconnecting" ? (
        <div className="home-today-bar">
          <span className="home-today-bar__empty">{t("matches.reconnecting")}</span>
        </div>
      ) : null}

      {!isLoading && !errorKey && !hasSearchQuery && matchView === MATCH_VIEW_ALL && countries.length > 0 && todayMatches.length === 0 ? (
        <div className="home-today-bar">
          <span className="home-today-bar__empty">{t("matches.noMatchToday")}</span>
        </div>
      ) : null}

      {isLoading && (
        <p className="state-message">{t("common.loading")}</p>
      )}

      {!isLoading && !errorKey && isAuthenticated && matchView === MATCH_VIEW_MY && isLoadingFavoriteMatches ? (
        <p className="state-message">{t("matches.loadingFavorites")}</p>
      ) : null}

      {errorKey && (
        <p className="state-message state-message--error">
          {t(errorKey)}
        </p>
      )}

      {!isLoading && !errorKey && !(isAuthenticated && matchView === MATCH_VIEW_MY && isLoadingFavoriteMatches) && filteredCountries.length === 0 && (
        <p className="state-message">
          {isAuthenticated && matchView === MATCH_VIEW_MY && !hasFavoriteMatchScope
            ? t("matches.emptyFavorites")
            : matchView === MATCH_VIEW_ALL
              ? t("matches.noMatchesToday")
              : t("matches.empty")}
        </p>
      )}

      {!isLoading && !errorKey && dayChoiceItems.length > 1 ? (
        <div className="home-day-nav">
          <span className="home-day-nav__label">{t("matches.matchDay")}</span>
          <ChoiceBox
            ariaLabel={t("matches.matchDay")}
            className="choice-box--home-days"
            items={dayChoiceItems}
            onChange={handleDayChoice}
            value={activeDayKey || targetDay?.dateKey}
          />
        </div>
      ) : null}

      {!isLoading && !errorKey && daySections.length > 0 && (
        <div
          className="home-day-list"
          data-match-view={matchView}
        >
          {daySections.map((day) => (
            <section className="home-day-section" id={`home-day-${day.dateKey}`} key={day.dateKey}>
              <header className="home-day-section__header">
                <div>
                  <h2>{day.label}</h2>
                  <p>{day.dateKey}</p>
                </div>
                <span>{t("matches.count", { count: day.matchCount })}</span>
              </header>

              {matchView === MATCH_VIEW_MY ? (
                <div className="match-list">
                  {getMatchesFromDay(day).map((match) => (
                    <MatchCard
                      className={match.isToday ? "match-card--today" : ""}
                      disableMatchLink={false}
                      isToday={match.isToday}
                      key={match.id}
                      match={match}
                      showFavoriteButton={isAuthenticated}
                    />
                  ))}
                </div>
              ) : (
                <div className="country-list">
                  {day.countries.map((country) => (
                    <CountrySection
                      key={country.id}
                      country={country}
                      disableMatchLinks={false}
                      showFavorites={isAuthenticated}
                      todayMatchId={firstTodayMatchId}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {showFloatingTodayButton ? (
        <button className="home-today-float" type="button" onClick={handleScrollToMatchDay}>
          {targetDayIsToday
            ? t("matches.todayCount", { count: todayMatches.length })
            : t("matches.dayCount", { label: targetDay?.label || t("matches.title"), count: targetDay?.matchCount || 0 })}
        </button>
      ) : null}
    </section>
  );
}

export default Home;
