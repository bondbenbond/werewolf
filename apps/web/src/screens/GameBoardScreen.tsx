import { Panel } from "../components/Panel";
import { CardGrid } from "../components/CardGrid";

type GameBoardData = {
  title: string;
  cards: Array<{ id: string; label: string }>; // placeholder
};

export function GameBoardScreen({ data }: { data: GameBoardData }) {
  return (
    <Panel title={data.title}>
      <CardGrid>
        {data.cards.map((card) => (
          <div key={card.id} className="card">
            <div className="card-face">{card.label}</div>
          </div>
        ))}
      </CardGrid>
    </Panel>
  );
}
