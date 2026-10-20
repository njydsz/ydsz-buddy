"""Demo plugin entry point."""

def setup(ctx):
    """Register tools with the Agent."""
    
    def greet(name: str = "World") -> str:
        """Generate a friendly greeting message."""
        return f"Hello, {name}! Welcome to ydsz-buddy."
    
    ctx.tool(
        name="greet",
        fn=greet,
        description="Generate a friendly greeting",
        parameters={
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Name of the person to greet"}
            }
        }
    )
