using System.Text.Json;
using MarcadorBasquet.Models;
using Microsoft.JSInterop;

namespace MarcadorBasquet.Services;

public class GameService(IJSRuntime js)
{
    private const string StorageKey = "marcador-basquet-v1";
    private const int MaxHistory = 300;

    public GameState State { get; private set; } = new();

    public bool CanUndo => State.History.Count > 0;

    public const int MaxOvertimes = 5;

    /// <summary>Q1–Q4 per a quarts, P1–P8 per a premini, i PR1, PR2... per a les pròrrogues.</summary>
    public string PeriodLabel => State.Period <= State.Periods
        ? $"{(State.Periods == 4 ? "Q" : "P")}{State.Period}"
        : $"PR{State.Period - State.Periods}";

    public string FormatLabel => $"{State.Periods} parts";

    /// <summary>Text del període per a la imatge compartida: "Q3 · 4 parts" o "Pròrroga 1".</summary>
    public string ShareLabel => State.Period <= State.Periods
        ? $"{PeriodLabel} · {FormatLabel}"
        : $"Pròrroga {State.Period - State.Periods}";

    public async Task LoadAsync()
    {
        try
        {
            var json = await js.InvokeAsync<string?>("localStorage.getItem", StorageKey);
            if (!string.IsNullOrWhiteSpace(json))
            {
                var state = JsonSerializer.Deserialize<GameState>(json);
                if (state?.Teams is { Length: 2 })
                {
                    if (state.Periods is not (4 or 8)) state.Periods = 4;
                    state.Period = Math.Clamp(state.Period, 1, state.Periods + MaxOvertimes);
                    State = state;
                }
            }
        }
        catch
        {
            // Dades corruptes o emmagatzematge no disponible: comencem de zero.
        }
    }

    /// <summary>Suma (o resta) punts. Retorna false si no hi ha hagut cap canvi.</summary>
    public Task<bool> AddPointsAsync(int team, int points) =>
        SetScoreAsync(team, State.Teams[team].Score + points);

    public async Task<bool> SetScoreAsync(int team, int value)
    {
        value = Math.Clamp(value, 0, 999);
        var t = State.Teams[team];
        if (t.Score == value) return false;

        State.History.Add(new ScoreChange(team, t.Score, value));
        if (State.History.Count > MaxHistory) State.History.RemoveAt(0);
        t.Score = value;
        await SaveAsync();
        return true;
    }

    public async Task UndoAsync()
    {
        if (!CanUndo) return;
        var last = State.History[^1];
        State.History.RemoveAt(State.History.Count - 1);
        State.Teams[last.Team].Score = last.Before;
        await SaveAsync();
    }

    public async Task UpdateTeamAsync(int team, string name, string color)
    {
        var t = State.Teams[team];
        t.Name = string.IsNullOrWhiteSpace(name) ? (team == 0 ? "Local" : "Visitant") : name.Trim();
        t.Color = color;
        await SaveAsync();
    }

    public async Task ChangePeriodAsync(int delta)
    {
        State.Period = Math.Clamp(State.Period + delta, 1, State.Periods + MaxOvertimes);
        await SaveAsync();
    }

    public async Task SwapSidesAsync()
    {
        State.Swapped = !State.Swapped;
        await SaveAsync();
    }

    /// <summary>Nou partit amb el format indicat: marcador a zero, es mantenen noms i colors.</summary>
    public async Task NewGameAsync(int periods)
    {
        State.Periods = periods is 4 or 8 ? periods : 4;
        foreach (var t in State.Teams) t.Score = 0;
        State.Period = 1;
        State.History.Clear();
        await SaveAsync();
    }

    private async Task SaveAsync()
    {
        try
        {
            await js.InvokeVoidAsync("localStorage.setItem", StorageKey, JsonSerializer.Serialize(State));
        }
        catch
        {
            // Si no es pot desar (mode privat, etc.) l'app continua funcionant.
        }
    }
}
