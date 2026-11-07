namespace MarcadorBasquet.Models;

public class Team
{
    public string Name { get; set; } = "";
    public int Score { get; set; }
    public string Color { get; set; } = "#ff7a1a";
}

/// <summary>Un canvi de marcador, per poder desfer-lo.</summary>
public record ScoreChange(int Team, int Before, int After);

public class GameState
{
    public Team[] Teams { get; set; } =
    [
        new() { Name = "Local", Color = "#ff7a1a" },
        new() { Name = "Visitant", Color = "#2ec5ff" }
    ];

    /// <summary>Nombre de parts reglamentàries: 4 (quarts) o 8 (premini).</summary>
    public int Periods { get; set; } = 4;

    public int Period { get; set; } = 1;
    public bool Swapped { get; set; }
    public List<ScoreChange> History { get; set; } = [];
}
