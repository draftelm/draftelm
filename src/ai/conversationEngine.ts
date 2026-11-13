import {
  EngineeringSpecification,
  createEmptySpecification,
} from "./engineeringSpecification";
import { applyEngineeringDefaults } from "./engineeringKnowledge";

export type ConversationQuestion = {
  id: string;
  title: string;
  options: string[];
};

export type ConversationState = {
  specification: EngineeringSpecification;
  questions: ConversationQuestion[];
  isReadyForSpecification: boolean;
};

export function startConversation(request: string): ConversationState {
  let specification = createEmptySpecification();

  const text = request.toLowerCase();

  specification.description = {
    value: request,
    source: "user",
  };

  if (text.includes("shelf")) {
    specification.partType = { value: "Shelf bracket", source: "ai" };
    specification.purpose = { value: "Support shelf", source: "ai" };
    specification.confidence = 70;
  } else if (text.includes("dyson") || text.includes("vacuum")) {
    specification.partType = { value: "Vacuum wall mount", source: "ai" };
    specification.purpose = {
      value: "Wall-mounted vacuum storage",
      source: "ai",
    };
    specification.loadKg = { value: 4, source: "engineering-rules" };
    specification.confidence = 85;
  } else if (text.includes("phone")) {
    specification.partType = { value: "Phone holder", source: "ai" };
    specification.purpose = { value: "Hold phone securely", source: "ai" };
    specification.loadKg = { value: 0.3, source: "engineering-rules" };
    specification.confidence = 75;
  } else if (text.includes("bracket") || text.includes("mount")) {
    specification.partType = { value: "General bracket", source: "ai" };
    specification.purpose = { value: null, source: "unknown" };
    specification.confidence = 45;
  } else {
    specification.partType = {
      value: "Custom functional part",
      source: "ai",
    };
    specification.purpose = { value: null, source: "unknown" };
    specification.confidence = 30;
  }

  specification = applyEngineeringDefaults(specification);

  const questions = getMissingInformationQuestions(specification);

  return {
    specification,
    questions,
    isReadyForSpecification: questions.length === 0,
  };
}

export function answerQuestion(
  currentState: ConversationState,
  questionId: string,
  answer: string
): ConversationState {
  let updatedSpecification = { ...currentState.specification };

  if (questionId === "partType") {
    updatedSpecification.partType = {
      value: answer,
      source: "user",
    };

    if (answer === "Shelf bracket") {
      updatedSpecification.purpose = {
        value: "Support shelf",
        source: "ai",
      };
    }

    if (answer === "Wall bracket" || answer === "Mounting bracket") {
      updatedSpecification.purpose = {
        value: "Mount object to surface",
        source: "ai",
      };
    }

    if (answer === "Corner bracket") {
      updatedSpecification.purpose = {
        value: "Reinforce corner joint",
        source: "ai",
      };
    }
  }

  if (questionId === "purpose") {
    updatedSpecification.purpose = {
      value: answer,
      source: "user",
    };
  }

  if (questionId === "loadKg") {
    updatedSpecification.loadKg = {
      value: parseLoadAnswer(answer),
      source: "user",
    };
  }

  if (questionId === "mountingSurface") {
    updatedSpecification.mountingSurface = {
      value: answer,
      source: "user",
    };
  }

  if (questionId === "depth") {
    updatedSpecification.depth = {
      value: parseDepthAnswer(answer),
      source: "user",
    };
  }

  if (questionId === "environment") {
    updatedSpecification.environment = {
      value: answer,
      source: "user",
    };
  }

  updatedSpecification.confidence = Math.min(
    100,
    updatedSpecification.confidence + 15
  );

  updatedSpecification = applyEngineeringDefaults(updatedSpecification);

  const questions = getMissingInformationQuestions(updatedSpecification);

  return {
    specification: updatedSpecification,
    questions,
    isReadyForSpecification: questions.length === 0,
  };
}

function getMissingInformationQuestions(
  specification: EngineeringSpecification
): ConversationQuestion[] {
  const questions: ConversationQuestion[] = [];

  if (
    specification.partType.value === "General bracket" ||
    specification.partType.value === "Custom functional part"
  ) {
    questions.push({
      id: "partType",
      title: "What type of bracket or part do you need?",
      options: [
        "Shelf bracket",
        "Wall bracket",
        "Corner bracket",
        "Mounting bracket",
      ],
    });

    return questions;
  }

  if (!specification.purpose.value) {
    questions.push({
      id: "purpose",
      title: "What is the main purpose of this part?",
      options: ["Support", "Hold", "Mount", "Protect", "Connect"],
    });
  }

  if (
    (specification.partType.value === "Shelf bracket" ||
      specification.partType.value === "Wall bracket" ||
      specification.partType.value === "Mounting bracket") &&
    !specification.loadKg.value
  ) {
    questions.push({
      id: "loadKg",
      title: "What weight should this part support?",
      options: ["Up to 5 kg", "5–15 kg", "15–30 kg", "30 kg+"],
    });
  }

  if (
    specification.partType.value === "Shelf bracket" &&
    !specification.depth.value
  ) {
    questions.push({
      id: "depth",
      title: "How deep is the shelf?",
      options: ["Under 150 mm", "150–250 mm", "250–400 mm", "Over 400 mm"],
    });
  }

  if (
    (specification.partType.value === "Shelf bracket" ||
      specification.partType.value === "Wall bracket" ||
      specification.partType.value === "Mounting bracket" ||
      specification.partType.value === "Vacuum wall mount") &&
    !specification.mountingSurface.value
  ) {
    questions.push({
      id: "mountingSurface",
      title: "What surface will this part mount to?",
      options: ["Brick", "Plasterboard", "Wood", "Metal"],
    });
  }

  if (!specification.environment.value) {
    questions.push({
      id: "environment",
      title: "Where will this part be used?",
      options: ["Indoor", "Outdoor", "Garage/workshop", "Vehicle"],
    });
  }

  return questions;
}

function parseLoadAnswer(answer: string): number {
  if (answer.includes("5–15")) return 15;
  if (answer.includes("15–30")) return 30;
  if (answer.includes("30")) return 40;
  return 5;
}

function parseDepthAnswer(answer: string): number {
  if (answer.includes("150–250")) return 250;
  if (answer.includes("250–400")) return 400;
  if (answer.includes("Over")) return 500;
  return 150;
}